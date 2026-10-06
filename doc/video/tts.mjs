/**
 * 旁白配音。narration.json → tts/<id>.wav，顺手量出每段真实时长。
 *
 * 用 DashScope 的 qwen-tts（voice Cherry）。已经存在的 wav 不重配——
 * 改一句话只会重出那一句，不会把整条重跑一遍。
 *
 *   node doc/video/tts.mjs
 */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FFMPEG = '/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg';
const ENV = '/Users/aisandbox/Documents/zhiji-yida/.env.local';

const KEY = fs.readFileSync(ENV, 'utf8').split('\n')
  .find(l => l.startsWith('DASHSCOPE_API_KEY='))?.split('=')[1].trim();
if (!KEY) { console.error(`${ENV} 里没有 DASHSCOPE_API_KEY`); process.exit(1); }

/** ffmpeg 没有 -show_entries，时长只能从 stderr 里捞。 */
const durationOf = f => {
  try { execFileSync(FFMPEG, ['-i', f], {stdio: 'pipe'}); } catch (e) {
    const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(e.stderr.toString());
    if (m) return +m[1] * 3600 + +m[2] * 60 + +m[3];
  }
  return 0;
};

const segs = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'));
const dir = path.join(HERE, 'tts');
fs.mkdirSync(dir, {recursive: true});

const out = [];
for (const s of segs) {
  const f = path.join(dir, `${s.id}.wav`);
  if (!fs.existsSync(f)) {
    const r = await fetch(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      {method: 'POST',
       headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
       body: JSON.stringify({model: 'qwen-tts', input: {text: s.text, voice: 'Cherry'}})});
    const j = await r.json();
    const url = j.output?.audio?.url;
    if (!url) { console.error(s.id, '配音失败', JSON.stringify(j).slice(0, 200)); continue; }
    fs.writeFileSync(f, Buffer.from(await (await fetch(url)).arrayBuffer()));
  }
  const dur = durationOf(f);
  out.push({id: s.id, dur});
  // 排进去的位置 vs 真实时长，对不上这里就能看出来
  const next = segs[segs.indexOf(s) + 1];
  const over = next && s.at + dur > next.at ? `  ← 压到下一句 ${(s.at + dur - next.at).toFixed(1)}s` : '';
  console.log(`${s.id}  ${dur.toFixed(2)}s  起 ${s.at}${over}`);
}
fs.writeFileSync(path.join(dir, 'durations.json'), JSON.stringify(out, null, 1));
const last = segs[segs.length - 1];
console.log(`最后一句收在 ${(last.at + out[out.length - 1].dur).toFixed(1)}s（正片 149.4s）`);
