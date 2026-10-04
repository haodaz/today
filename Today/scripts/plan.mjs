#!/usr/bin/env node
/**
 * Prompt 试验台。改完 prompt 直接跑这个看输出，不用重编 APK。
 *
 *   PROVIDER=nebius   NEBIUS_API_KEY=...    node scripts/plan.mjs "一段话"
 *   PROVIDER=dashscope DASHSCOPE_API_KEY=... node scripts/plan.mjs "一段话"
 *   PROVIDER=openrouter OPENROUTER_API_KEY=... node scripts/plan.mjs --en "..."
 *
 * 不给参数就用内置的样例输入（一段很像真实语音转写的话）。
 */

import {existsSync, readFileSync} from 'node:fs';

const SRC = new URL('../src/agent/', import.meta.url);

// 自动读 .env.local，省得每次手打环境变量。已在 .gitignore 里。
const envFile = new URL('../.env.local', import.meta.url);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
// prompt.js 是纯 JS，直接 import。改 prompt 立刻能看输出，不用编译。
const {buildMessages} = await import(new URL('prompt.js', SRC).href);

const PRESETS = {
  openai: {baseUrl: 'https://api.openai.com/v1', model: process.env.MODEL || 'gpt-5.6-luna', key: 'OPENAI_API_KEY'},
  nebius: {baseUrl: 'https://api.tokenfactory.nebius.com/v1', model: process.env.MODEL || 'nvidia/nvidia-nemotron-3-nano-30b-a3b', key: 'NEBIUS_API_KEY'},
  dashscope: {baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: process.env.MODEL || 'qwen-plus', key: 'DASHSCOPE_API_KEY'},
  openrouter: {baseUrl: 'https://openrouter.ai/api/v1', model: process.env.MODEL || 'anthropic/claude-sonnet-4.5', key: 'OPENROUTER_API_KEY'},
};

const SAMPLE = `啊今天又没睡好。明天要带孩子去打疫苗，得提前去不然要排很久。
家里牛奶没了还有洗衣液。周三要交那个学校的表格我老是忘。
哦对我妈昨天打电话我没接到要回她。
衣服堆了两天了。还有那个保险的事一直拖着不想弄。
我自己好像好几天没出过门了。`;

const args = process.argv.slice(2);
const en = args.includes('--en');
const text = args.filter(a => a !== '--en').join(' ') || SAMPLE;

const name = process.env.PROVIDER || 'nebius';
const p = PRESETS[name];
if (!p) { console.error(`未知 PROVIDER=${name}，可选：${Object.keys(PRESETS).join(' / ')}`); process.exit(1); }
const apiKey = process.env[p.key];
if (!apiKey) { console.error(`缺少环境变量 ${p.key}`); process.exit(1); }

const now = new Date().toLocaleString(en ? 'en-US' : 'zh-CN', {hour12: false});
const messages = buildMessages({braindump: text, now, lang: en ? 'en' : 'zh'});

console.error(`\x1b[2m→ ${name} / ${p.model}\x1b[0m\n`);
const t0 = Date.now();
const res = await fetch(`${p.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
  // 新一代推理模型（gpt-5.x / gpt-6 系）只接受默认 temperature，传了会 400。
  body: JSON.stringify({
    model: p.model,
    messages,
    ...(/^(gpt-[56]|o[0-9])/.test(p.model) ? {} : {temperature: 0.4}),
    response_format: {type: 'json_object'},
  }),
});
if (!res.ok) { console.error(`\x1b[31m${res.status}\x1b[0m`, await res.text()); process.exit(1); }
const data = await res.json();
const raw = data.choices?.[0]?.message?.content ?? '';

let plan;
try {
  const b = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  plan = JSON.parse(b.slice(b.indexOf('{'), b.lastIndexOf('}') + 1));
} catch { console.error('解析失败，原始输出：\n', raw); process.exit(1); }

// 按电视上的样子排版，好判断「这段话放上去好不好看」
const W = s => [...s].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
console.log(`\x1b[1m${plan.greeting}\x1b[0m\n`);
console.log('今天');
for (const t of plan.focus ?? []) {
  const her = t.forHer ? ' \x1b[33m← 给她自己\x1b[0m' : '';
  console.log(`  ☐ ${t.label}${t.note ? `  \x1b[2m${t.note}\x1b[0m` : ''}${her}`);
  if (W(t.label) > 28) console.log(`    \x1b[31m⚠ 这行太长，电视上会被截断（${W(t.label)}/28）\x1b[0m`);
}
if (plan.later?.length) {
  console.log('\n\x1b[2m今天不做：\x1b[0m');
  for (const l of plan.later) console.log(`  \x1b[2m· ${l}\x1b[0m`);
}
const n = plan.focus?.length ?? 0;
const her = plan.focus?.filter(t => t.forHer).length ?? 0;
console.log(`\n\x1b[2m${n} 件 · 给她自己的 ${her} 件 · ${Date.now() - t0}ms · ${data.usage?.total_tokens ?? '?'} tokens\x1b[0m`);
if (n > 3) console.log('\x1b[31m⚠ 超过三件\x1b[0m');
if (her === 0) console.log('\x1b[31m⚠ 没有一件是给她自己的 —— prompt 第三条没生效\x1b[0m');
