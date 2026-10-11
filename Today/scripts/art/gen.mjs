/**
 * 窗景生图。
 *
 * 电视上那块背景原来是一层淡紫色的渐变——全天开着不刺眼，但也什么都没说。
 * 现在换成一扇窗：跟着时辰（清晨 / 白天 / 傍晚 / 入夜）和天气（晴 / 阴 / 雨 / 雪）变。
 * 雨天窗边靠着一把黄伞，那就是「出门带伞」，不用写字。
 *
 * 一套十六张，提示词全在 prompts.json 里。改一张只改一行、只重生那一张：
 *
 *   node scripts/art/gen.mjs                 # 缺哪张生哪张
 *   node scripts/art/gen.mjs dawn-rain       # 只重生这一张（会覆盖）
 *   node scripts/art/gen.mjs --probe "..."   # 试一句提示词，出到 scratch
 *
 * 用 DashScope 通义万相（key 在 .env.local）。异步提交 → 轮询 → 下载 → 转 JPEG。
 * 同一个 seed、同一段「房间」描述，十六张才像同一扇窗。
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = path.join(ROOT, 'server', 'art');
const FFMPEG = '/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg';

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const KEY = env.DASHSCOPE_API_KEY;
if (!KEY) { console.error('.env.local 里没有 DASHSCOPE_API_KEY'); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(path.join(HERE, 'prompts.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function generate(prompt, file, {size = spec.size, negative = spec.negative, seed = spec.seed, model = spec.model} = {}) {
  const submit = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable'},
    body: JSON.stringify({
      model,
      input: {prompt, negative_prompt: negative},
      // prompt_extend 关掉：它会改写提示词，十六张就不像同一扇窗了
      parameters: {size, n: 1, seed, prompt_extend: false, watermark: false},
    }),
  });
  const sub = await submit.json();
  if (!sub.output?.task_id) throw new Error('提交失败 ' + JSON.stringify(sub).slice(0, 300));
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    const j = await (await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${sub.output.task_id}`,
      {headers: {Authorization: `Bearer ${KEY}`}})).json();
    const st = j.output?.task_status;
    if (st === 'SUCCEEDED') {
      const url = j.output.results?.[0]?.url;
      const png = file.replace(/\.jpg$/, '.png');
      fs.writeFileSync(png, Buffer.from(await (await fetch(url)).arrayBuffer()));
      // 电视上只是背景，1440 宽的 JPEG 足够；一张两百来 KB，十六张加起来比一首歌小
      execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-i', png, '-q:v', '4', file]);
      fs.unlinkSync(png);
      return;
    }
    if (st === 'FAILED') throw new Error('生成失败 ' + JSON.stringify(j.output).slice(0, 300));
  }
  throw new Error('超时');
}

const args = process.argv.slice(2);
if (args[0] === '--probe') {
  const dir = path.join(ROOT, '.art-probe');
  fs.mkdirSync(dir, {recursive: true});
  const f = path.join(dir, `probe-${Date.now()}.jpg`);
  await generate(spec.room + ' ' + args[1], f);
  console.log('→', f);
  process.exit(0);
}

fs.mkdirSync(OUT, {recursive: true});
const only = args[0];
for (const [name, scene] of Object.entries(spec.scenes)) {
  if (only && name !== only) continue;
  const file = path.join(OUT, `${name}.jpg`);
  if (!only && fs.existsSync(file)) continue;
  process.stdout.write(`${name} … `);
  for (let attempt = 1; ; attempt++) {
    try {
      // 个别几张用同一个 seed 出不来想要的光，单独换一个，记在 seedOverride 里
      await generate(`${spec.room} ${scene}`, file, {
        seed: spec.seedOverride?.[name] ?? spec.seed,
        model: spec.modelOverride?.[name] ?? spec.model,
        // 阴雨雪天：正向里说「没有阳光」压不住，得进负面词。晴天那几张的光影是要的，所以只给这几张加
        negative: [spec.negative, spec.negativeExtra?.[name]].filter(Boolean).join(', '),
      });
      console.log('好了');
      break;
    } catch (e) {
      // 万相有并发限流，撞上了就等一会儿再来，别整批失败
      if (attempt >= 4) { console.log('放弃：' + e.message); break; }
      await sleep(8000 * attempt);
    }
  }
  await sleep(2500);
}

/*
 * 家人头像。按角色和年龄的一套通用形象，不是谁的画像——
 * 两个妈妈、两个爸爸都能用，孩子按年龄分，不靠名字猜性别，也不生成任何真人的脸。
 */
for (const [key, who] of Object.entries(spec.avatars ?? {})) {
  const name = `avatar-${key}`;
  if (only && name !== only) continue;
  const file = path.join(OUT, `${name}.jpg`);
  if (!only && fs.existsSync(file)) continue;
  process.stdout.write(`${name} … `);
  for (let attempt = 1; ; attempt++) {
    try {
      await generate(`${spec.avatarStyle} ${who}`, file, {size: spec.avatarSize, negative: spec.avatarNegative});
      console.log('好了');
      break;
    } catch (e) {
      if (attempt >= 4) { console.log('放弃：' + e.message); break; }
      await sleep(8000 * attempt);
    }
  }
  await sleep(2500);
}
