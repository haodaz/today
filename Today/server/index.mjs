#!/usr/bin/env node
/**
 * Today 的本地服务。
 *
 * 这是过渡实现，形状和最终的 AWS 版本一致：
 *   手机 POST /braindump → agent → 存下来
 *   电视 GET  /plan      → 取今天的 plan
 *   电视 POST /toggle    → 勾选状态回写
 *
 * 之后换成 API Gateway + Lambda + Bedrock + DynamoDB 时，
 * 这三个端点的请求和响应格式不变，手机页和电视端一行都不用改。
 *
 *   node server/index.mjs
 */
import {createServer} from 'node:http';
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMessages} from '../src/agent/prompt.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DATA = join(ROOT, '.data');
const PLAN_FILE = join(DATA, 'plan.json');
const PORT = Number(process.env.PORT || 8910);

// 读 .env.local
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PROVIDERS = {
  openai: {baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-luna', key: 'OPENAI_API_KEY'},
  nebius: {baseUrl: 'https://api.tokenfactory.nebius.com/v1', model: 'nvidia/nvidia-nemotron-3-nano-30b-a3b', key: 'NEBIUS_API_KEY'},
  dashscope: {baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', key: 'DASHSCOPE_API_KEY'},
};
const P = PROVIDERS[process.env.PROVIDER || 'openai'];
const MODEL = process.env.MODEL || P.model;

if (!existsSync(DATA)) mkdirSync(DATA, {recursive: true});

const todayKey = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD

function loadPlan() {
  if (!existsSync(PLAN_FILE)) return null;
  try {
    const p = JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
    // 跨天就作废。今天的事不该在明天还挂着。
    return p.date === todayKey() ? p : null;
  } catch { return null; }
}
const savePlan = p => writeFileSync(PLAN_FILE, JSON.stringify(p, null, 2));

/** 模型不总是听话：超过三件截断，done 从 false 开始，缺字段补默认值。 */
function normalize(v) {
  const o = v ?? {};
  return {
    greeting: typeof o.greeting === 'string' ? o.greeting : '',
    focus: (Array.isArray(o.focus) ? o.focus : []).slice(0, 3).map((t, i) => ({
      id: String(t?.id ?? i + 1),
      label: String(t?.label ?? '').trim(),
      note: t?.note ? String(t.note).trim() : undefined,
      forHer: t?.forHer === true,
      done: false,
    })).filter(t => t.label),
    later: (Array.isArray(o.later) ? o.later : []).map(String).map(s => s.trim()).filter(Boolean).slice(0, 8),
  };
}

async function plan(braindump, lang) {
  const apiKey = process.env[P.key];
  if (!apiKey) throw new Error(`缺少 ${P.key}`);
  const now = new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {hour12: false});

  const r = await fetch(`${P.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify({
      model: MODEL,
      messages: buildMessages({braindump, now, lang}),
      // 新一代推理模型只接受默认 temperature
      ...(/^(gpt-[56]|o[0-9])/.test(MODEL) ? {} : {temperature: 0.4}),
      response_format: {type: 'json_object'},
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);

  const raw = (await r.json()).choices?.[0]?.message?.content ?? '';
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  return normalize(JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1)));
}

const json = (res, code, obj) => {
  res.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'});
  res.end(JSON.stringify(obj));
};
const readBody = req => new Promise(ok => {
  let b = ''; req.on('data', c => (b += c)); req.on('end', () => ok(b));
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

  // 手机页
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(readFileSync(join(HERE, 'phone.html')));
  }

  // 手机说了一段话
  if (url.pathname === '/braindump' && req.method === 'POST') {
    try {
      const {braindump, lang} = JSON.parse(await readBody(req));
      if (!braindump?.trim()) return json(res, 400, {error: '空的'});
      // 语言由手机页决定，一路传到 agent：英文界面就出英文计划。
      const p = await plan(braindump, lang === 'zh' ? 'zh' : 'en');
      savePlan({...p, date: todayKey(), at: new Date().toISOString()});
      console.log(`[${new Date().toLocaleTimeString('zh-CN')}] 排好 ${p.focus.length} 件，给她自己的 ${p.focus.filter(t => t.forHer).length} 件`);
      return json(res, 200, p);
    } catch (e) {
      console.error('失败：', e.message);
      return json(res, 500, {error: String(e.message || e)});
    }
  }

  // 电视轮询
  if (url.pathname === '/plan') {
    return json(res, 200, loadPlan() ?? {greeting: '', focus: [], later: []});
  }

  // 电视打勾
  if (url.pathname === '/toggle' && req.method === 'POST') {
    const {id} = JSON.parse(await readBody(req) || '{}');
    const p = loadPlan();
    if (!p) return json(res, 404, {error: '今天还没有计划'});
    p.focus = p.focus.map(t => (t.id === id ? {...t, done: !t.done} : t));
    savePlan(p);
    return json(res, 200, p);
  }

  json(res, 404, {error: 'not found'});
}).listen(PORT, '0.0.0.0', () => {
  console.log(`\nToday 本地服务已启动  ·  ${process.env.PROVIDER || 'openai'} / ${MODEL}`);
  console.log(`  手机上打开：  http://192.168.1.243:${PORT}`);
  console.log(`  电视取计划：  http://192.168.1.243:${PORT}/plan\n`);
});
