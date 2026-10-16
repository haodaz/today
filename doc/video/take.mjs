/**
 * 录一幕：手机和电视同时录，所有动作在同一条时间线上。
 *
 *   node doc/video/take.mjs <幕名>          # 幕在 doc/video/takes.json 里
 *
 * 为什么不用 QuickTime 录手机、再手动对齐：
 *   「手机发出去，五秒后电视自己变」是整个产品的证据，那五秒必须是真的五秒。
 *   两条录像各录各的，对齐靠肉眼，差一两秒就是在剪辑台上造证据。
 *   这里手机每一帧都带浏览器给的毫秒时间戳，电视那边记下按键的时刻，
 *   合成的时候按时间戳对，误差在零点几秒。
 *
 * 手机：无头 Chrome，CDP 截帧（Page.startScreencast），500×910 @2x。
 *       不是真浏览器窗口，所以也没有「Claude started debugging」那条横幅。
 * 电视：adb shell screenrecord，录的是电视的输出信号，不拍房间。
 *       画面不动就不出帧；一段最长 180 秒。
 *
 * 输出 doc/video/takes/<幕名>/：
 *   phone/000123.jpg + phone.json（每帧的时间戳）
 *   tv.mp4 + tv.json（开录时刻、每次按键的时刻）
 */
import {spawn, execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ADB = `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const TV = process.env.TV || '192.168.1.190:5555';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8910';

const name = process.argv[2];
const takes = JSON.parse(fs.readFileSync(path.join(HERE, 'takes.json'), 'utf8'));
const take = takes[name];
if (!take) { console.error('没有这一幕：', name, '\n有：', Object.keys(takes).join(' ')); process.exit(1); }

const OUT = path.join(HERE, 'takes', name);
fs.rmSync(OUT, {recursive: true, force: true});
fs.mkdirSync(path.join(OUT, 'phone'), {recursive: true});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now() / 1000;
const adb = (...a) => execFileSync(ADB, ['-s', TV, ...a], {stdio: ['ignore', 'pipe', 'pipe']}).toString();
const tvLog = {keys: []};

// ── 手机：起一个无头 Chrome ───────────────────────────
const port = 9333;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/today-take-profile', 'about:blank'], {stdio: 'ignore'});
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'}); if (r.ok) target = await r.json(); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(ok => ws.addEventListener('open', ok, {once: true}));
let seq = 0; const waiting = new Map();
const frames = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && waiting.has(m.id)) { const {ok, fail} = waiting.get(m.id); waiting.delete(m.id); m.error ? fail(new Error(m.error.message)) : ok(m.result); return; }
  if (m.method === 'Page.screencastFrame') {
    const {data, metadata, sessionId} = m.params;
    const file = String(frames.length).padStart(6, '0') + '.jpg';
    fs.writeFileSync(path.join(OUT, 'phone', file), Buffer.from(data, 'base64'));
    frames.push({file, t: metadata.timestamp});
    send('Page.screencastFrameAck', {sessionId}).catch(() => {});
  }
});
const send = (method, params = {}) => new Promise((ok, fail) => { const id = ++seq; waiting.set(id, {ok, fail}); ws.send(JSON.stringify({id, method, params})); });
const evalJS = async expr => (await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true})).result?.value;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 500, height: 910, deviceScaleFactor: 2, mobile: true});

// ── 电视：开录 ─────────────────────────────────────────
let rec = null;
if (take.tv !== false) {
  try { adb('shell', 'rm', '-f', '/sdcard/take.mp4'); } catch {}
  tvLog.spawn = now();
  rec = spawn(ADB, ['-s', TV, 'shell', 'screenrecord', '--bit-rate', '16000000',
    '--time-limit', String(Math.min(180, take.seconds ?? 170)), '/sdcard/take.mp4'], {stdio: 'ignore'});
  await sleep(1500);
}

await send('Page.startScreencast', {format: 'jpeg', quality: 92, everyNthFrame: 1});

// ── 按剧本走 ───────────────────────────────────────────
// adb 按一次键要一秒多（设备上要起一个 input 进程），真正按下去的那一下在快结束的时候。
// 所以前后都记：t0 发出、t1 回来；对齐时用 t1。
const key = async k => { const t0 = now(); adb('shell', 'input', 'keyevent', `KEYCODE_${k}`); tvLog.keys.push({k, t0, t1: now()}); };
for (const step of take.steps) {
  const [op, ...a] = step;
  console.log(new Date().toISOString().slice(11, 19), op, a.join(' ').slice(0, 60));
  if (op === 'open') { await send('Page.navigate', {url: BASE + a[0]}); }
  else if (op === 'wait') { await sleep(a[0]); }
  else if (op === 'js') { await evalJS(a[0]); }
  else if (op === 'type') {
    // 一个字一个字打，像人在打字；标点后面停一下
    await evalJS(`document.querySelector(${JSON.stringify(a[0])}).focus()`);
    for (const ch of a[1]) {
      await send('Input.insertText', {text: ch});
      await sleep(/[,.]/.test(ch) ? 220 : 45 + Math.random() * 55);
    }
  }
  else if (op === 'enter') {
    for (const type of ['keyDown', 'keyUp'])
      await send('Input.dispatchKeyEvent', {type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: type === 'keyDown' ? '\r' : undefined});
  }
  else if (op === 'scroll') { await evalJS(`window.scrollBy({top:${a[0]},behavior:'smooth'})`); }
  else if (op === 'tv') { await key(a[0]); }
  else if (op === 'tvshell') { const t0 = now(); adb('shell', ...a); tvLog.keys.push({k: a.join(' '), t0, t1: now()}); }
  else throw new Error('不认识的动作 ' + op);
}

await send('Page.stopScreencast');
fs.writeFileSync(path.join(OUT, 'phone.json'), JSON.stringify(frames));
ws.close(); chrome.kill();

if (rec) {
  // 停录：给 screenrecord 发 SIGINT 让它正常收尾，不然文件没有时长信息
  try { adb('shell', 'pkill', '-INT', 'screenrecord'); } catch {}
  await new Promise(r => rec.on('exit', r));
  await sleep(1500);
  execFileSync(ADB, ['-s', TV, 'pull', '/sdcard/take.mp4', path.join(OUT, 'tv.mp4')], {stdio: 'ignore'});
  fs.writeFileSync(path.join(OUT, 'tv.json'), JSON.stringify(tvLog, null, 1));
}
console.log(`完成：手机 ${frames.length} 帧${rec ? '，电视 tv.mp4' : ''} → ${OUT}`);
process.exit(0);
