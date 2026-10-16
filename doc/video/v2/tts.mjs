/**
 * 第二版配音：OpenAI gpt-4o-mini-tts。
 * 第一版用的 qwen-tts 读英文带口音，评委是美国人，一听就出戏。
 * 这个模型收「语气指示」：温和、不赶、像在讲一件事，不像广告。
 *   node doc/video/v2/tts.mjs        已存在的不重配
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const F = '/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg';
const env = fs.readFileSync(path.join(HERE, '../../../Today/.env.local'), 'utf8');
const KEY = env.split('\n').find(l => l.startsWith('OPENAI_API_KEY='))?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
const VOICE = process.env.VOICE || 'sage';
const STYLE = 'Warm, calm and unhurried. A thoughtful narrator telling a small true story, not an advert. ' +
  'Gentle pauses at commas and dashes. Plain American English.';
const segs = JSON.parse(fs.readFileSync(path.join(HERE, 'narration.json'), 'utf8'));
const dir = path.join(HERE, 'tts'); fs.mkdirSync(dir, {recursive: true});
const durOf = f => { try { execFileSync(F, ['-i', f], {stdio: 'pipe'}); } catch (e) {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(String(e.stderr)); return m ? +m[1]*3600 + +m[2]*60 + +m[3] : 0; } return 0; };
const out = [];
for (const s of segs) {
  const wav = path.join(dir, `${s.id}.wav`);
  if (!fs.existsSync(wav)) {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {method: 'POST',
      headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({model: 'gpt-4o-mini-tts', voice: VOICE, input: s.text, instructions: STYLE, response_format: 'wav'})});
    if (!r.ok) { console.error(s.id, r.status, (await r.text()).slice(0, 200)); process.exit(1); }
    fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));
  }
  const dur = durOf(wav); out.push({id: s.id, dur});
  const next = segs[segs.indexOf(s) + 1];
  const over = next && s.at + dur > next.at ? `  ← 压到下一句 ${(s.at + dur - next.at).toFixed(1)}s` : '';
  console.log(`${s.id}  ${dur.toFixed(2)}s  ${s.at} → ${(s.at + dur).toFixed(1)}${over}`);
}
fs.writeFileSync(path.join(dir, 'durations.json'), JSON.stringify(out, null, 1));
