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
import {readFileSync, writeFileSync, existsSync, mkdirSync, statSync} from 'node:fs';
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
  // 主力。实测 1.2–2.4 秒，比 gpt-5.6-luna 快四倍，判断不差。
  nebius: {baseUrl: 'https://api.tokenfactory.nebius.com/v1', model: 'MiniMaxAI/MiniMax-M3', key: 'NEBIUS_API_KEY'},
  openai: {baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', key: 'OPENAI_API_KEY'},
  dashscope: {baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', key: 'DASHSCOPE_API_KEY'},
};

/**
 * 主力 + 兜底。
 *
 * 主力挂了（限流、欠费、服务抖动）不该让她对着一个报错的屏幕，
 * 所以自动切到下一家。供应商无关那层就是为这个存在的——
 * 实测三家都能跑同一套 prompt，这不是架构美学，是一条真的后路。
 */
const CHAIN = (process.env.PROVIDER ? [process.env.PROVIDER] : ['nebius', 'openai'])
  .filter(n => PROVIDERS[n]);
const P = PROVIDERS[CHAIN[0]];
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

/**
 * 一天的文件现在存的是整条对话，不是一次 turn。
 *   messages: [{who:'today'|'her', text, cards?, at}]
 * 对话是最外层——卡片是 Today 说出来的一种消息，不是另一个区域。
 */
const loadDay = (k = dayKey()) => {
  const d = readJSON(dayFile(k), null);
  if (!d) return null;
  // 兼容早期只存一次 turn 的文件
  if (!d.messages) return {date: d.date, messages: d.say || d.cards?.length
    ? [{who: 'today', text: d.say ?? '', cards: d.cards ?? [], at: d.at}] : []};
  return d;
};
const saveDay = d => writeJSON(dayFile(dayKey()), d);
const appendMessage = m => {
  const d = loadDay() ?? {date: dayKey(), messages: []};
  d.messages.push({...m, at: new Date().toISOString()});
  saveDay(d);
  return d;
};
/** 当天最后一次带任务卡的消息——打勾和统计都认它。 */
const latestTasks = (d = loadDay()) => {
  for (let i = (d?.messages?.length ?? 0) - 1; i >= 0; i--) {
    const c = d.messages[i].cards?.find(x => x.type === 'tasks');
    if (c) return {msg: d.messages[i], card: c};
  }
  return null;
};

/** 昨天没做完的。拿来判断什么该放下，不是用来追责。 */
function carryOver() {
  const y = new Date(Date.now() - 86400000);
  const t = latestTasks(loadDay(dayKey(y)));
  return (t?.card.items ?? []).filter(i => !i.done).map(i => i.label);
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

/**
 * 模型不总是听话。超过三件截断，缺字段补默认值。
 *
 * done 的处理是关键：她在和 Today 商量这张卡时，模型可能忘记带回 done。
 * 已有 id 的事项一律以服务端记的 done 为准，除非模型明确把它设成了 true——
 * 她说「做完了」要生效，但模型的疏忽不该把她打过的勾抹掉。
 */
function toTurn(v, prev) {
  const o = v ?? {};
  const was = new Map((prev?.focus ?? []).map(t => [t.id, t]));
  const tasks = (Array.isArray(o.focus) ? o.focus : []).slice(0, 3).map((t, i) => {
    const id = String(t?.id ?? i + 1);
    const old = was.get(id);
    return {
      id,
      label: String(t?.label ?? '').trim(),
      note: t?.note ? String(t.note).trim() : undefined,
      forHer: t?.forHer === true,
      done: t?.done === true || (old?.done === true && t?.done !== false),
    };
  }).filter(t => t.label);

  const later = (Array.isArray(o.later) ? o.later : [])
    .map(String).map(s => s.trim()).filter(Boolean).slice(0, 8);

  const cards = [];
  if (tasks.length) cards.push({type: 'tasks', items: tasks});
  if (later.length) cards.push({type: 'later', items: later});

  return {turn: {say: typeof o.say === 'string' ? o.say : '', cards}, remember: o.remember ?? {}};
}

/** 今天已经排好的那张卡，喂回给模型让它改而不是重排。 */
function currentPlan() {
  const t = latestTasks();
  const later = [...(loadDay()?.messages ?? [])].reverse()
    .flatMap(m => m.cards ?? []).find(c => c.type === 'later');
  if (!t && !later) return undefined;
  return {focus: t?.card.items ?? [], later: later?.items ?? []};
}

/** 向一家供应商要一次 JSON。 */
async function callOne(name, messages) {
  const p = PROVIDERS[name];
  const model = name === CHAIN[0] ? MODEL : p.model;
  if (p.bedrock) return converseJSON(messages, {model});

  const apiKey = process.env[p.key];
  if (!apiKey) throw new Error(`缺少 ${p.key}`);
  const r = await fetch(`${p.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model,
      messages,
      // 新一代推理模型只接受默认 temperature
      ...(/^(gpt-[56]|o[0-9])/.test(model) ? {} : {temperature: 0.4}),
      response_format: {type: 'json_object'},
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  const raw = (await r.json()).choices?.[0]?.message?.content ?? '';
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
}

/** 调一次模型，拿回 JSON。主力挂了自动切下一家。 */
async function callJSON(messages) {
  let last;
  for (const name of CHAIN) {
    try {
      return await callOne(name, messages);
    } catch (e) {
      last = e;
      if (name !== CHAIN[CHAIN.length - 1]) {
        console.warn(`  ${name} 不行（${String(e.message).slice(0, 80)}），换下一家`);
      }
    }
  }
  throw last;
}

/** 今天还没打勾的。 */
function openItems() {
  const t = latestTasks();
  return (t?.card.items ?? []).filter(i => !i.done).map(i => i.label);
}

async function ask(braindump, lang) {
  const now = new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour12: false});
  const current = currentPlan();
  const raw = await callJSON(
    buildMessages({braindump, now, lang, memory: loadMemory(), carryOver: carryOver(), current}),
  );
  return toTurn(raw, current);
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
  if (/^\/today-[a-z0-9-]+\.png$/.test(url.pathname)) {
    const f = join(ROOT, 'assets/today', url.pathname.slice(1));
    if (!existsSync(f)) return json(res, 404, {error: 'no such figure'});
    // 用文件 mtime 做 ETag：形象换了浏览器立刻拿到新的，
    // 没换则走 304。开发期一天的强缓存会让人以为代码没生效。
    const tag = `"${statSync(f).mtimeMs}"`;
    if (req.headers['if-none-match'] === tag) { res.writeHead(304); return res.end(); }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-cache',
      ETag: tag,
    });
    return res.end(readFileSync(f));
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

      // 她说的话也进对话流——这是一条对话，不是一次查询
      appendMessage({who: 'her', text: braindump.trim()});

      const {turn, remember} = await ask(braindump, L);
      const mem = mergeMemory(loadMemory(), remember);
      writeJSON(MEM_FILE, mem);
      const day = appendMessage({who: 'today', text: turn.say, cards: turn.cards});

      const n = turn.cards.find(c => c.type === 'tasks')?.items.length ?? 0;
      const kept = mem.people.length + mem.rhythms.length + mem.carrying.length + mem.hers.length + mem.notes.length;
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 排了 ${n} 件 · 记着 ${kept} 条`);
      return json(res, 200, day);
    } catch (e) {
      console.error('失败：', e.message);
      return json(res, 500, {error: String(e.message || e)});
    }
  }

  // 整条对话。手机端按对话渲染，这是最外层。
  if (url.pathname === '/day') {
    const d = loadDay() ?? {date: dayKey(), messages: []};
    return json(res, 200, {...d, memory: memoryCard(loadMemory())});
  }

  // 电视要的：最后一次开口 + 它记着什么。电视不是对话面，是一眼看见的那块。
  if (url.pathname === '/turn') {
    const d = loadDay();
    const last = [...(d?.messages ?? [])].reverse().find(m => m.who === 'today');
    const t = latestTasks(d);
    const cards = [];
    if (t) cards.push(t.card);
    const later = [...(d?.messages ?? [])].reverse()
      .flatMap(m => m.cards ?? []).find(c => c.type === 'later');
    if (later) cards.push(later);
    const mc = memoryCard(loadMemory());
    if (mc) cards.push(mc);
    return json(res, 200, {say: last?.text ?? '', cards});
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
    const t = latestTasks(d);
    if (!t) return json(res, 404, {error: '今天还没有计划'});
    t.card.items = t.card.items.map(i => (i.id === id ? {...i, done: !i.done} : i));
    saveDay(d);
    return json(res, 200, d);
  }

  json(res, 404, {error: 'not found'});
}).listen(PORT, '0.0.0.0', () => {
  const m = loadMemory();
  const n = m.people.length + m.rhythms.length + m.carrying.length + m.hers.length + m.notes.length;
  console.log(`\nToday 本地服务  ·  ${CHAIN[0]} / ${MODEL}` +
    (CHAIN.length > 1 ? `  （兜底：${CHAIN.slice(1).join(' → ')}）` : ''));
  for (const n of CHAIN) {
    const p = PROVIDERS[n];
    if (p.bedrock) {
      if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE)
        console.log(`  ⚠️  ${n}：没找到 AWS 凭证`);
    } else if (!process.env[p.key]) {
      console.log(`  ⚠️  ${n}：缺 ${p.key}`);
    }
  }
  console.log(`  记着 ${n} 条`);
  console.log(`  手机：http://192.168.1.243:${PORT}\n`);
});
