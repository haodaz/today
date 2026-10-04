#!/usr/bin/env node
/**
 * Today 的 3D 形象。
 *
 * 扁平插画在手机上够用，但参考（蚂蚁阿福这类）的质感是半卡通 3D：
 * 有体积、有柔光、像黏土或软胶玩具，不是赛璐璐也不是写实渲染。
 * 教育和医疗这类产品对信任感要求高，立体角色比贴纸更像「有人在」。
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

// 质感锁死：半卡通 3D、柔光、黏土/软胶、干净底好去底
const STYLE =
  '毛茸茸的绒毛质感是重点：能看清一根根短绒毛，边缘有蓬松的毛边，' +
  '脸颊和胸口的毛更长更软，像一只高级的绒毛玩具，不是光滑的塑料或乙烯基，' +
  '柔和的大面积漫射光，轻微次表面散射让耳朵和毛边透出暖光，' +
  '暖橙色皮毛配奶油色腹部，黑色虎纹，额头有虎斑，' +
  '头略大、身体圆润柔软、四肢短而敦实，眼睛大而湿润有高光，' +
  '表情自然放松，不摆拍，不正襟危坐，' +
  '角色悬浮在纯白背景上，没有地面，没有地面投影，' +
  '大量留白，全身，柔软，温暖，想摸一把';

const NEG =
  '写实照片, 真实老虎, 凶狠, 獠牙, 2D, 扁平, 线稿, 复杂背景, 文字, 水印, ' +
  '多个角色, 杂乱, 低分辨率, 怪异比例, 地面, 地面阴影, 投影, 桌面, 平台, ' +
  '光滑表面, 塑料, 乙烯基, 陶瓷, 金属, 反光, 硬边, 无毛, 短毛紧贴, ' +
  '企业吉祥物, 商业代言, 僵硬站姿, 面无表情, 严肃, 成熟, 瘦长';

const FIGURES = {
  '3d-holding':
    '一只毛茸茸的小老虎幼崽，两只小爪子轻轻收在胸前捧着，微微低头看着怀里，' +
    '眼睛温柔地弯着，表情安心，身体是放松的坐姿或站姿。' + STYLE,
  '3d-listening':
    '一只毛茸茸的小老虎幼崽，歪着头认真听，一只耳朵软软地垂下来，' +
    '眼睛看向一侧，表情专注又温柔，身体放松地坐着。' + STYLE,
  '3d-curl':
    '一只毛茸茸的小老虎幼崽，蜷成一团趴着，尾巴绕到身前，' +
    '抬眼看过来，眼神柔软，整只像一个暖呼呼的绒球。' + STYLE,
};

const api = (p, init) =>
  fetch(`https://dashscope.aliyuncs.com${p}`, {
    ...init,
    headers: {Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(init?.headers ?? {})},
  }).then(r => r.json());

const tasks = {};
for (const [name, prompt] of Object.entries(FIGURES)) {
  const r = await api('/api/v1/services/aigc/text2image/image-synthesis', {
    method: 'POST',
    headers: {'X-DashScope-Async': 'enable'},
    body: JSON.stringify({
      model: 'wanx2.1-t2i-plus',
      input: {prompt, negative_prompt: NEG},
      parameters: {n: 2, size: '1024*1024', prompt_extend: false},
    }),
  });
  const id = r?.output?.task_id;
  if (!id) { console.error(`${name} 提交失败:`, JSON.stringify(r).slice(0, 200)); continue; }
  tasks[name] = id;
  console.log(`${name} → ${id}`);
}

for (const [name, id] of Object.entries(tasks)) {
  let out;
  for (let i = 0; i < 45; i++) {
    await new Promise(r => setTimeout(r, 4000));
    out = (await api(`/api/v1/tasks/${id}`))?.output;
    if (out?.task_status === 'SUCCEEDED' || out?.task_status === 'FAILED') break;
    process.stdout.write('.');
  }
  console.log();
  if (out?.task_status !== 'SUCCEEDED') { console.error(`${name}: ${out?.task_status}`); continue; }
  let i = 0;
  for (const r of out.results ?? []) {
    if (!r.url) continue;
    const buf = Buffer.from(await (await fetch(r.url)).arrayBuffer());
    writeFileSync(join(OUT, `${name}-${++i}.png`), buf);
    console.log(`  ${name}-${i}.png  ${(buf.length / 1024 | 0)}KB`);
  }
}
