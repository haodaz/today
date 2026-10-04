#!/usr/bin/env node
/**
 * Today 的本地服务。
 *
 * 过渡实现，形状和最终的 AWS 版本一致：
 *   手机 POST /braindump → agent → 存当天 + 更新记忆
 *   电视 GET  /turn      → 取 Today 这次开口（一句话 + 卡片）
 *   电视 POST /toggle    → 勾选回写
 *        GET  /memory    → Today 记着什么
 *
 * 换成 API Gateway + Lambda + Bedrock + DynamoDB 时这几个端点不变。
 *
 *   node server/index.mjs
 */
import {createServer} from 'node:http';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMessages, buildGreeting} from '../src/agent/prompt.js';
import {converseJSON, DEFAULT_MODEL as BEDROCK_DEFAULT} from './bedrock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, '.data');
const DAYS = join(DATA, 'days');
const MEM_FILE = join(DATA, 'memory.json');
const PORT = Number(process.env.PORT || 8910);

for (const d of [DATA, DAYS]) if (!existsSync(d)) mkdirSync(d, {recursive: true});

const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PROVIDERS = {
  // Bedrock 不走 OpenAI 兼容接口，单独一条路径（server/bedrock.mjs）。
  // 凭证按 AWS 默认链解析，不用 apiKey 字段。
  bedrock: {bedrock: true, model: BEDROCK_DEFAULT},
  openai: {baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', key: 'OPENAI_API_KEY'},
  nebius: {baseUrl: 'https://api.tokenfactory.nebius.com/v1', model: 'nvidia/nvidia-nemotron-3-nano-30b-a3b', key: 'NEBIUS_API_KEY'},
  dashscope: {baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', key: 'DASHSCOPE_API_KEY'},
};
const P = PROVIDERS[process.env.PROVIDER || 'openai'];
const MODEL = process.env.MODEL || P.model;

const dayKey = (d = new Date()) => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD
const dayFile = k => join(DAYS, `${k}.json`);

const readJSON = (f, fallback) => {
  try { return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fallback; }
  catch { return fallback; }
};
const writeJSON = (f, v) => writeFileSync(f, JSON.stringify(v, null, 2));

const EMPTY_MEMORY = {people: [], rhythms: [], carrying: [], hers: [], notes: [], updatedAt: ''};
const loadMemory = () => readJSON(MEM_FILE, EMPTY_MEMORY);
const loadDay = (k = dayKey()) => readJSON(dayFile(k), null);

/** 昨天没做完的。拿来判断什么该放下，不是用来追责。 */
function carryOver() {
  const y = new Date(Date.now() - 86400000);
  const d = loadDay(dayKey(y));
  return (d?.cards ?? [])
    .filter(c => c.type === 'tasks')
    .flatMap(c => c.items.filter(t => !t.done).map(t => t.label));
}

/**
 * 合并记忆。只增不删，去重，各类有上限——
 * 记忆无限增长会把上下文撑爆，也会让它记住一堆早就不成立的事。
 */
const CAPS = {people: 12, rhythms: 10, carrying: 10, hers: 10, notes: 16};
function mergeMemory(cur, add) {
  const out = {...cur};
  const key = v => (typeof v === 'string' ? v.trim() : `${v?.name ?? ''}`.trim());
  for (const k of Object.keys(CAPS)) {
    const seen = new Set((cur[k] ?? []).map(key).filter(Boolean));
    const fresh = (add?.[k] ?? []).filter(v => {
      const s = key(v);
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
    // 新的放前面：近期的事更可能还成立
    out[k] = [...fresh, ...(cur[k] ?? [])].slice(0, CAPS[k]);
  }
  out.updatedAt = new Date().toISOString();
  return out;
}

/** 模型不总是听话。超过三件截断，done 从 false 开始，缺字段补默认值。 */
function toTurn(v) {
  const o = v ?? {};
  const tasks = (Array.isArray(o.focus) ? o.focus : []).slice(0, 3).map((t, i) => ({
    id: String(t?.id ?? i + 1),
    label: String(t?.label ?? '').trim(),
    note: t?.note ? String(t.note).trim() : undefined,
    forHer: t?.forHer === true,
    done: false,
  })).filter(t => t.label);

  const later = (Array.isArray(o.later) ? o.later : [])
    .map(String).map(s => s.trim()).filter(Boolean).slice(0, 8);

  const cards = [];
  if (tasks.length) cards.push({type: 'tasks', items: tasks});
  if (later.length) cards.push({type: 'later', items: later});

  return {turn: {say: typeof o.say === 'string' ? o.say : '', cards}, remember: o.remember ?? {}};
}

/** 调一次模型，拿回 JSON。供应商的差别全收在这里。 */
async function callJSON(messages) {
  if (P.bedrock) return converseJSON(messages, {model: MODEL});

  const apiKey = process.env[P.key];
  if (!apiKey) throw new Error(`缺少 ${P.key}`);
  const r = await fetch(`${P.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model: MODEL,
      messages,
      // 新一代推理模型只接受默认 temperature
      ...(/^(gpt-[56]|o[0-9])/.test(MODEL) ? {} : {temperature: 0.4}),
      response_format: {type: 'json_object'},
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const raw = (await r.json()).choices?.[0]?.message?.content ?? '';
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
}

/** 今天还没打勾的。 */
function openItems() {
  const d = loadDay();
  return (d?.cards ?? [])
    .filter(c => c.type === 'tasks')
    .flatMap(c => c.items.filter(t => !t.done).map(t => t.label));
}

async function ask(braindump, lang) {
  const now = new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour12: false});
  return toTurn(
    await callJSON(buildMessages({braindump, now, lang, memory: loadMemory(), carryOver: carryOver()})),
  );
}

/**
 * Today 先开口。
 *
 * 这是「AI 主导第一层沟通」的地方：她打开页面的那一刻，
 * Today 已经基于它记得的东西说了一句只有它能说的话——
 * 而不是一行写死的「我在听」。
 */
async function greet(lang) {
  const now = new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour12: false});
  const open = openItems();
  const r = await callJSON(buildGreeting({now, lang, memory: loadMemory(), open, left: open.length}));
  let say = typeof r?.say === 'string' ? r.say.trim() : '';
  // 模型偶尔不守长度。这句在屏幕上是最大的一行，太长会吃掉半屏，
  // 所以超限就截到第一个句读为止——宁可短，不要满屏。
  const LIMIT = lang === 'zh' ? 20 : 90;
  if (say.length > LIMIT) {
    const cut = say.slice(0, LIMIT + 8).match(/^[\s\S]*?[。，；,;.]/);
    // 句读要跟着语言走，不能给英文补一个中文句号
    say = (cut ? cut[0] : say.slice(0, LIMIT)).replace(/[，,；;]$/, lang === 'zh' ? '。' : '.');
  }
  return {say};
}

/** 记忆也是一张卡片——她得看得见 Today 记住了什么，才谈得上信任。 */
function memoryCard(m) {
  const items = [
    ...(m.people ?? []).map(p => ({id: `p:${p.name}`, text: `${p.name} — ${p.who}`})),
    ...(m.rhythms ?? []).map(s => ({id: `r:${s}`, text: s})),
    ...(m.hers ?? []).map(s => ({id: `h:${s}`, text: s})),
  ].slice(0, 6);
  return items.length ? {type: 'memory', items} : null;
}

const json = (res, code, obj) => {
  res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise(ok => {
  let b = ''; req.on('data', c => (b += c)); req.on('end', () => ok(b));
});
const readRaw = req => new Promise(ok => {
  const cs = []; req.on('data', c => cs.push(c)); req.on('end', () => ok(Buffer.concat(cs)));
});

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(readFileSync(join(HERE, 'phone.html')));
  }

  // Today 的形象
  if (url.pathname === '/today-listening.png') {
    res.writeHead(200, {'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400'});
    return res.end(readFileSync(join(ROOT, 'assets/today/today-listening.png')));
  }

  /**
   * 手机录的音 → 文字。
   *
   * 不走系统键盘的听写键：实测很多手机根本没有那个键（要在设置里
   * 单独开启），把产品押在一个大多数人没开的系统开关上是错的。
   * 所以页面自己录，这里转写。
   *
   * 代价是 getUserMedia 需要安全上下文——iOS Safari 只在 HTTPS 下
   * 给麦克风权限。所以这个端点必须配合 HTTPS 隧道才有意义。
   */
  if (url.pathname === '/transcribe' && req.method === 'POST') {
    try {
      const audio = await readRaw(req);
      if (!audio.length) return json(res, 400, {error: '没收到音频'});
      const mime = req.headers['content-type'] || 'audio/webm';
      // iOS Safari 录出来是 audio/mp4，安卓是 audio/webm，扩展名要对上
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';

      const fd = new FormData();
      fd.append('file', new Blob([audio], {type: mime}), `say.${ext}`);
      fd.append('model', 'whisper-1');

      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {Authorization: `Bearer ${process.env.OPENAI_API_KEY}`},
        body: fd,
      });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const {text} = await r.json();
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 听到 ${audio.length / 1024 | 0}KB → ${String(text).slice(0, 40)}…`);
      return json(res, 200, {text: String(text ?? '').trim()});
    } catch (e) {
      console.error('转写失败：', e.message);
      return json(res, 500, {error: String(e.message || e)});
    }
  }

  if (url.pathname === '/braindump' && req.method === 'POST') {
    try {
      const {braindump, lang} = JSON.parse(await readBody(req));
      if (!braindump?.trim()) return json(res, 400, {error: '空的'});
      const L = lang === 'zh' ? 'zh' : 'en';

      const {turn, remember} = await ask(braindump, L);
      const mem = mergeMemory(loadMemory(), remember);
      writeJSON(MEM_FILE, mem);
      writeJSON(dayFile(dayKey()), {...turn, date: dayKey(), at: new Date().toISOString()});

      const n = turn.cards.find(c => c.type === 'tasks')?.items.length ?? 0;
      const kept = mem.people.length + mem.rhythms.length + mem.carrying.length + mem.hers.length + mem.notes.length;
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 排了 ${n} 件 · 记着 ${kept} 条`);
      return json(res, 200, turn);
    } catch (e) {
      console.error('失败：', e.message);
      return json(res, 500, {error: String(e.message || e)});
    }
  }

  // 电视要的：Today 这次开口 + 它记着什么
  if (url.pathname === '/turn') {
    const d = loadDay();
    const base = d ? {say: d.say, cards: d.cards} : {say: '', cards: []};
    const mc = memoryCard(loadMemory());
    return json(res, 200, mc ? {...base, cards: [...base.cards, mc]} : base);
  }

  // Today 先开口。手机页一打开就调这个。
  if (url.pathname === '/greet') {
    try {
      const lang = url.searchParams.get('lang') === 'zh' ? 'zh' : 'en';
      return json(res, 200, await greet(lang));
    } catch (e) {
      // 开场白拿不到不该挡住她说话——退回空串，页面自己有兜底
      console.error('开场失败：', e.message);
      return json(res, 200, {say: ''});
    }
  }

  // 对外地址。隧道地址每次重启会变，所以不写死在 app 里，由服务端告知。
  if (url.pathname === '/where') {
    return json(res, 200, {url: process.env.PUBLIC_URL || ''});
  }

  if (url.pathname === '/memory') return json(res, 200, loadMemory());

  if (url.pathname === '/toggle' && req.method === 'POST') {
    const {id} = JSON.parse((await readBody(req)) || '{}');
    const d = loadDay();
    if (!d) return json(res, 404, {error: '今天还没有计划'});
    d.cards = d.cards.map(c =>
      c.type === 'tasks'
        ? {...c, items: c.items.map(t => (t.id === id ? {...t, done: !t.done} : t))}
        : c,
    );
    writeJSON(dayFile(dayKey()), d);
    return json(res, 200, {say: d.say, cards: d.cards});
  }

  json(res, 404, {error: 'not found'});
}).listen(PORT, '0.0.0.0', () => {
  const m = loadMemory();
  const n = m.people.length + m.rhythms.length + m.carrying.length + m.hers.length + m.notes.length;
  const who = process.env.PROVIDER || 'openai';
  console.log(`\nToday 本地服务  ·  ${who} / ${MODEL}`);
  if (P.bedrock && !process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.log('  ⚠️  没找到 AWS 凭证，Bedrock 调用会失败');
  }
  console.log(`  记着 ${n} 条`);
  console.log(`  手机：http://192.168.1.243:${PORT}\n`);
});
