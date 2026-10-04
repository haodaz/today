#!/usr/bin/env node
/**
 * 把全身形象裁成半身。
 *
 * 半身用在手机和电视的顶部：头 + 胸 + 爪子就够了，腿和尾巴只是占地方。
 * 底边做一道渐隐——硬切出来像被截断的，渐隐像从画面里长出来的。
 *
 *   node scripts/halfbody.mjs in.png out.png [--keep=0.63] [--fade=0.16]
 */
import sharp from 'sharp';

const [, , inPath, outPath, ...rest] = process.argv;
const num = (k, d) => {
  const v = rest.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
  return v ? Number(v) : d;
};
const KEEP = num('keep', 0.63);   // 保留顶部多少比例
const FADE = num('fade', 0.16);   // 底部多少比例做渐隐

const src = sharp(inPath).ensureAlpha();
const {width: W, height: H} = await src.metadata();
const cut = Math.round(H * KEEP);

const {data} = await src
  .extract({left: 0, top: 0, width: W, height: cut})
  .raw()
  .toBuffer({resolveWithObject: true});

const fadeRows = Math.max(1, Math.round(cut * FADE));
const start = cut - fadeRows;
for (let y = start; y < cut; y++) {
  // 平滑衰减，不是线性——线性的边界看得出一条线
  const t = (y - start) / fadeRows;
  const k = 1 - t * t * (3 - 2 * t);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4 + 3;
    data[i] = Math.round(data[i] * k);
  }
}

const out = await sharp(data, {raw: {width: W, height: cut, channels: 4}})
  .trim({threshold: 1})
  .png({compressionLevel: 9})
  .toFile(outPath);
console.log(`${outPath}  ${out.width}x${out.height}`);
