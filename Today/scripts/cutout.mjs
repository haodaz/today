#!/usr/bin/env node
/**
 * 给 Today 的形象去底。
 *
 * 脱胎于 mamaagent/scripts/cutout.mjs，但改了两处，否则会出事：
 *
 * 1) 通义万相给的是米白底（约 249,241,215），不是纯白。
 *    原脚本按「r,g,b 都 >232 且饱和度 <14」判断，米白过不了饱和度那关。
 *    这里改成按实测的角落颜色做容差匹配。
 *
 * 2) 原脚本从所有边缘像素种子扩散。但捧心那只老虎的肚子也是米色，
 *    而且一直延伸到图片下边缘——从下边缘扩散会把肚子一起吃掉。
 *    这里只从四角种子扩散：背景是环绕主体的一块连通区域，四角足够覆盖它，
 *    而被主体隔开的内部米色区域（肚子、嘴套、耳朵内侧）不会被波及。
 *
 *   node scripts/cutout.mjs in.png out.png
 */
import sharp from 'sharp';

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('用法: node scripts/cutout.mjs in.png out.png');
  process.exit(1);
}

const {data, info} = await sharp(inPath).ensureAlpha().raw().toBuffer({resolveWithObject: true});
const {width: W, height: H} = info;
const at = p => p * 4;

/** 背景色取四角平均——比写死一个值稳，不同批次出图底色会有细微差别。 */
const cornerIdx = [0, (W - 1), (H - 1) * W, (H - 1) * W + (W - 1)];
const bgRef = [0, 1, 2].map(c =>
  Math.round(cornerIdx.reduce((s, p) => s + data[at(p) + c], 0) / cornerIdx.length),
);

/** 容差。放宽到 34 是为了吃掉 JPEG 式的噪点和渐变边缘。 */
const TOL = 34;
const dist = p => {
  const i = at(p);
  return Math.hypot(data[i] - bgRef[0], data[i + 1] - bgRef[1], data[i + 2] - bgRef[2]);
};
const isBg = p => dist(p) < TOL;

// 只从四角种子扩散
const seen = new Uint8Array(W * H);
const bg = new Uint8Array(W * H);
const stack = cornerIdx.slice();
while (stack.length) {
  const p = stack.pop();
  if (seen[p]) continue;
  seen[p] = 1;
  if (!isBg(p)) continue;
  bg[p] = 1;
  const x = p % W, y = (p / W) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < W - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - W);
  if (y < H - 1) stack.push(p + W);
}

// 透明化 + 边缘羽化：紧挨背景的那一圈按「离背景色多远」给部分不透明度，
// 否则放到深色背景上会出现一圈米白描边
for (let p = 0; p < W * H; p++) {
  const i = at(p);
  if (bg[p]) { data[i + 3] = 0; continue; }
  const x = p % W, y = (p / W) | 0;
  const nearBg =
    (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) ||
    (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
  if (nearBg) {
    data[i + 3] = Math.round(Math.max(0, Math.min(255, (dist(p) / TOL) * 255)));
  }
}

const out = await sharp(data, {raw: {width: W, height: H, channels: 4}})
  .trim({threshold: 1})
  .png({compressionLevel: 9})
  .toFile(outPath);

const kept = bg.reduce((s, v) => s + (v ? 0 : 1), 0);
console.log(
  `${outPath}  ${out.width}x${out.height}  去掉 ${(100 - (kept / (W * H)) * 100).toFixed(0)}% 背景  bg=rgb(${bgRef})`,
);
