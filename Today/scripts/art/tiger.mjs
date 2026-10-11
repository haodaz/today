/**
 * 老虎换姿势。
 *
 * 电视上那只老虎只有一个姿势：捧着手。窗外下雨了、天黑了，它还是那样捧着。
 * 这里拿原图做参考，让通义 qwen-image-edit 只改动作和手里的东西——
 * 用参考图而不是重新生一只，才能保证还是同一只老虎。
 *
 * 透明背景是个难点：改图模型出的图没有透明通道，而老虎身上本来就有大片白毛，
 * 抠白底会把它的脸一起抠掉。所以先把它垫到纯绿底上交给模型，回来再抠绿——
 * 老虎身上没有绿。
 *
 *   node scripts/art/tiger.mjs umbrella      # 生一个姿势
 *   node scripts/art/tiger.mjs               # 缺哪个生哪个
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = path.join(ROOT, 'server', 'art');
const SRC = path.join(ROOT, 'assets', 'today', 'today-tiger.png');
const FFMPEG = '/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg';
const TMP = path.join(ROOT, '.art-probe');
fs.mkdirSync(TMP, {recursive: true});

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const KEY = env.DASHSCOPE_API_KEY;

const SAME = 'Keep the exact same tiger: same face, same eyes, same fur colors and stripes, same 3D Pixar-like style, same proportions. Keep the plain solid pure green background exactly as it is. Nothing else in the picture.';

const POSES = {
  // 入夜：这块屏到了晚上本来就沉下来，不当客厅里的第二个灯泡。老虎也该歇了——
  // 它在打盹，也是在说「今天到这儿就行」。
  sleep: `The same little tiger character, now sitting wrapped in a small soft lilac blanket, eyes gently closed, sleepy peaceful smile, about to doze off. ${SAME} Full body visible, centered.`,
  // 下雪
  scarf: `The same little tiger character, now wearing a chunky knitted cream scarf wrapped around its neck, paws together, cosy and content. ${SAME} Upper body visible, centered.`,
  // 下雨。保持原来的半身姿势、双手握伞——姿势变得越少，越像同一只。
  // 第一版让它全身站着撑伞，脸跟着变了，像另一只差不多的老虎。
  // 试过让伞靠在肩上、伞杆偏到一边——脸更像了，但伞面被画框切掉一截，在电视上像一条坏边。
  umbrella: `The same little tiger character in the same upper-body pose, now holding the handle of a small open yellow umbrella above its head with both paws, cheerful. ${SAME} Upper body visible, centered.`,
};

const ff = args => execFileSync(FFMPEG, ['-loglevel', 'error', '-y', ...args]);

// 1) 垫绿底、放大：模型看见的就是绿底，回来也更可能保持绿底
const ref = path.join(TMP, 'tiger-green.png');
if (!fs.existsSync(ref)) {
  ff(['-f', 'lavfi', '-i', 'color=c=0x00FF00:s=1024x1024', '-i', SRC,
      '-filter_complex', '[1]scale=-1:860[t];[0][t]overlay=(W-w)/2:(H-h)/2:format=auto',
      '-frames:v', '1', ref]);
}
/*
 * 参考图得是公网地址——万相的图生图不收直接塞进请求里的图。
 * 本地跑的时候用隧道：把绿底参考图放进 server/art/ref-tiger.jpg，
 * 再把隧道地址传进来：TIGER_REF=https://xxx.trycloudflare.com/art/ref-tiger.jpg
 */
const REF_URL = process.env.TIGER_REF;
if (!REF_URL && !['--rekey', '--cut'].includes(process.argv[2])) { console.error('要先给 TIGER_REF（参考图的公网地址）'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** ffmpeg 只给 -i 不给输出时会报错退出，尺寸在它的错误输出里。 */
function sizeOf(file) {
  try {
    execFileSync(FFMPEG, ['-hide_banner', '-i', file], {stdio: ['ignore', 'pipe', 'pipe']});
  } catch (e) {
    const m = /, (\d{2,5})x(\d{2,5})/.exec(String(e.stderr));
    if (m) return [+m[1], +m[2]];
  }
  throw new Error('读不出尺寸：' + file);
}

/**
 * 抠绿，再把四周透明的地方裁掉。逐像素自己算，不用现成滤镜：
 *
 *   「有多绿」= g − max(r, b)
 *     很绿            → 全透明（背景）
 *     有一点绿（那圈边）→ 半透明，并把绿压回去
 *   压绿用 g = min(g, max(r, b))。黄色的 r 和 g 差不多大，这一步动不到它——
 *   第一次用 ffmpeg 的 despill，它把那把黄伞减成了橙伞；换 colorkey 不去溢色，
 *   又留了一圈绿毛边。这个式子两头都顾到了。
 */
/** 半身的姿势。原图底下本来是渐隐的，这几张跟着带了一截淡出去的身子。 */
const HALF = new Set(['scarf', 'umbrella']);

/**
 * 身子还是实的最低那一行。
 *
 * 看一行里「完全不透明」的像素占这一行可见像素的多少：身子那几行几乎全是实的，
 * 渐隐那截越往下越少。从下往上找第一行过八成的，切在那儿。
 * 用比例不用宽度：撑伞那只上面是一把大伞，按宽度算，最宽的那行是脸，会切到下巴。
 */
function solidBottom(px, W, x0, x1, y0, y1) {
  const ratio = y => {
    let vis = 0, full = 0;
    for (let x = x0; x <= x1; x++) { const a = px[(y * W + x) * 4 + 3]; if (a > 24) { vis++; if (a >= 250) full++; } }
    return vis < 20 ? 0 : full / vis;
  };
  for (let y = y1; y > y0 + (y1 - y0) * 0.5; y--) {
    if (ratio(y) >= 0.8) {
      for (let yy = y + 1; yy <= y1; yy++) for (let x = x0; x <= x1; x++) px[(yy * W + x) * 4 + 3] = 0;
      return y;
    }
  }
  return y1;
}

function key(raw, name) {
  const [W, H] = sizeOf(raw);
  const px = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', raw, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    {maxBuffer: 1 << 28});
  const LO = 18, HI = 70;          // 绿度门槛：低于 LO 是老虎本身，高于 HI 是背景
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const green = g - Math.max(r, b);
    let a = 255;
    if (green >= HI) a = 0;
    else if (green > LO) a = Math.round(255 * (HI - green) / (HI - LO));
    if (g > Math.max(r, b)) px[i + 1] = Math.max(r, b);   // 压绿：黄不受影响
    px[i + 3] = a;
    if (a > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  // 半身的：把底下淡出去的那截切掉，切出一条齐边——摆的时候贴着屏幕底，
  // 身子就像顺着画框出去了，而不是在半空里淡掉
  if (HALF.has(name)) y1 = solidBottom(px, W, x0, x1, y0, y1);
  const pad = 8;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); if (!HALF.has(name)) y1 = Math.min(H - 1, y1 + pad);
  const cw = (x1 - x0 + 1) & ~1, ch = (y1 - y0 + 1) & ~1;
  const out = path.join(OUT, `tiger-${name}.png`);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-',
    // 电视上老虎只有 86dp 高，420 像素足够；原尺寸一张一点五兆
    '-vf', `crop=${cw}:${ch}:${x0}:${y0},scale=-2:420:flags=lanczos,format=rgba`, '-frames:v', '1', out], {input: px});
  return out;
}

async function edit(name) {
  const sub = await (await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis', {
    method: 'POST',
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'X-DashScope-Async': 'enable'},
    body: JSON.stringify({
      model: 'wan2.5-i2i-preview',
      input: {prompt: POSES[name], images: [REF_URL],
        negative_prompt: 'text, watermark, second tiger, extra limbs, different character, realistic tiger, background scenery, gradient background'},
      parameters: {n: 1, watermark: false},
    }),
  })).json();
  if (!sub.output?.task_id) throw new Error('提交失败 ' + JSON.stringify(sub).slice(0, 300));
  let url;
  for (let i = 0; i < 100 && !url; i++) {
    await sleep(3000);
    const j = await (await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${sub.output.task_id}`,
      {headers: {Authorization: `Bearer ${KEY}`}})).json();
    if (j.output?.task_status === 'SUCCEEDED') url = j.output.results?.[0]?.url;
    if (j.output?.task_status === 'FAILED') throw new Error('生成失败 ' + JSON.stringify(j.output).slice(0, 300));
  }
  if (!url) throw new Error('超时');
  const raw = path.join(TMP, `tiger-${name}-raw.png`);
  fs.writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return {raw, out: key(raw, name)};
}

/*
 * 从一张已经透明的 PNG 切齐边：node tiger.mjs --cut <源> <名字>
 *   原来那只捧着手的：--cut assets/today/today-tiger.png default
 *   （详情页还用原图——那里它不贴着底，齐边浮在半空反而怪）
 */
if (process.argv[2] === '--cut') {
  // 第三个参数：再往上多切几成。围巾那只的渐隐垫在绿底上变成了黄绿色、是不透明的，
  // 比例判断认不出来，只能按眼睛量的多切一截
  const [src, name, more = '0'] = process.argv.slice(3);
  const [W, H] = sizeOf(src);
  const px = execFileSync(FFMPEG, ['-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {maxBuffer: 1 << 28});
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (px[(y * W + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  y1 = solidBottom(px, W, x0, x1, y0, y1);
  y1 -= Math.round((y1 - y0) * Number(more));
  const cw = (x1 - x0 + 1) & ~1, ch = (y1 - y0 + 1) & ~1;
  const out = path.join(OUT, `tiger-${name}.png`);
  execFileSync(FFMPEG, ['-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-',
    '-vf', `crop=${cw}:${ch}:${x0}:${y0},scale=-2:'min(420,ih)':flags=lanczos,format=rgba`, '-frames:v', '1', out], {input: px});
  console.log(name, '→', out);
  process.exit(0);
}

if (process.argv[2] === '--rekey') {
  const name = process.argv[3];
  console.log(name, '→', key(path.join(TMP, `tiger-${name}-raw.png`), name));
  process.exit(0);
}
const only = process.argv[2];
for (const name of Object.keys(POSES)) {
  if (only && name !== only) continue;
  const {raw, out} = await edit(name);
  console.log(name, '→', out, '（原图', raw, '）');
}
