#!/usr/bin/env node
/**
 * 用通义万相出 Today 的形象。
 *
 * 两只：
 *   listening — 聆听的小老虎，给手机（她对它说话的那一面）
 *   holding   — 捧心的小老虎，给电视（它替她收着东西的那一面）
 *
 *   node scripts/figure.mjs
 */
import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets/today');
if (!existsSync(OUT)) mkdirSync(OUT, {recursive: true});

for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && m[2] && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const KEY = process.env.DASHSCOPE_API_KEY;
if (!KEY) { console.error('缺少 DASHSCOPE_API_KEY'); process.exit(1); }

// 视觉规范写死在提示词里：单一主色、米白底、不卡通化、留白干净好去底
const STYLE =
  '极简扁平插画，粗细均匀的手绘线条，暖陶土橙色为唯一主色，' +
  '米白色纯净背景，大量留白，无阴影，正面居中构图，' +
  '童书插画质感，温暖，安静，可信赖，不卖萌';

const NEG =
  '照片, 写实, 3D渲染, 复杂背景, 文字, 水印, 多个角色, ' +
  '杂乱阴影, 低分辨率, 吓人, 獠牙, 凶狠, 过度装饰, 渐变';

const FIGURES = {
  listening:
    '一只温柔的小老虎，侧头认真聆听的姿态，耳朵微微前倾，眼睛微微眯起，神情专注柔和。' + STYLE,
  holding:
    '一只温柔的小老虎，双手捧在胸前，像小心捧着什么珍贵的东西，低头看着怀里，神情专注温柔，有守护感。' + STYLE,
};

const api = (p, init) =>
  fetch(`https://dashscope.aliyuncs.com${p}`, {
    ...init,
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {})},
  }).then(r => r.json());

const submit = prompt =>
  api('/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: {'X-DashScope-Async': 'enable'},
    body: JSON.stringify({
      model: 'wanx2.1-t2i-plus',
      input: {prompt, negative_prompt: NEG},
      // 一次出两张，好挑
      parameters: {n: 2, size: '1024*1024', prompt_extend: false},
    }),
  });

const tasks = {};
for (const [name, prompt] of Object.entries(FIGURES)) {
  const r = await submit(prompt);
  const id = r?.output?.task_id;
  if (!id) { console.error(`${name} 提交失败:`, JSON.stringify(r).slice(0, 200)); continue; }
  tasks[name] = id;
  console.log(`${name} → ${id}`);
}

for (const [name, id] of Object.entries(tasks)) {
  let out;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 4000));
    out = (await api(`/api/v1/tasks/${id}`))?.output;
    if (out?.task_status === 'SUCCEEDED' || out?.task_status === 'FAILED') break;
    process.stdout.write('.');
  }
  console.log();
  if (out?.task_status !== 'SUCCEEDED') {
    console.error(`${name}: ${out?.task_status} ${out?.message ?? ''}`);
    continue;
  }
  let i = 0;
  for (const r of out.results ?? []) {
    if (!r.url) continue;
    const buf = Buffer.from(await (await fetch(r.url)).arrayBuffer());
    const f = join(OUT, `${name}-${++i}.png`);
    writeFileSync(f, buf);
    console.log(`  ${f}  ${(buf.length / 1024 | 0)}KB`);
  }
}
