/**
 * 出截图。
 *
 * 为什么不用 `chrome --headless --screenshot`：那个的 `--window-size`
 * 只决定画布多大，不决定布局视口多宽。页面照着八百多的宽度排完，
 * 再按你给的尺寸裁一刀——右边的东西就这么没了。调小窗口也没用，
 * 因为布局宽度根本不跟着变。
 *
 * 所以走 CDP，用 Emulation.setDeviceMetricsOverride 真的把它变成一台手机：
 * 宽高、二倍屏、mobile=true。Node 24 自带 WebSocket，不需要任何依赖。
 *
 *   node scripts/shoot.mjs out/phone.png http://127.0.0.1:8910/
 *   node scripts/shoot.mjs out/phone.png http://127.0.0.1:8910/ --w 390 --h 844 --wait 9000
 *
 * 电视那一面不走这儿——那边是真的 app 跑在模拟器里：
 *   adb exec-out screencap -p > out/tv.png
 */
import {spawn} from 'node:child_process';
import {writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const CHROME =
  process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const [out, url] = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!out || !url) {
  console.error('用法: node scripts/shoot.mjs <输出.png> <网址> [--w 390] [--h 844] [--wait 9000]');
  process.exit(1);
}
const flag = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const W = flag('w', 390);
const H = flag('h', 844);
const WAIT = flag('wait', 9000);
const PORT = flag('port', 9222);

const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/today-shoot-profile',
  'about:blank',
], {stdio: 'ignore'});

/** CDP 一问一答。每条带一个自增 id，回来对上号就算完。 */
function session(ws) {
  let n = 0;
  const waiting = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const {ok, fail} = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? fail(new Error(m.error.message)) : ok(m.result);
    }
  });
  return (method, params = {}) =>
    new Promise((ok, fail) => {
      const id = ++n;
      waiting.set(id, {ok, fail});
      ws.send(JSON.stringify({id, method, params}));
    });
}

try {
  // Chrome 起来要一会儿，端口没通就重试
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, {method: 'PUT'});
      if (r.ok) target = await r.json();
    } catch {}
  }
  if (!target) throw new Error('连不上 Chrome 的调试端口');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, {once: true});
    ws.addEventListener('error', () => fail(new Error('WebSocket 连不上')), {once: true});
  });
  const send = session(ws);

  await send('Page.enable');
  // 这一句是全部关键：真的把它当一台手机来排版，而不是裁一张大图
  await send('Emulation.setDeviceMetricsOverride', {
    width: W, height: H, deviceScaleFactor: 2, mobile: true,
  });
  await send('Page.navigate', {url});
  // 开场白要等模型回话，所以给足时间。宁可多等，不要截一张半成品。
  await sleep(WAIT);

  const {data} = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false});
  mkdirSync(dirname(out), {recursive: true});
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`${out}  ${W}x${H} @2x`);
  ws.close();
} finally {
  chrome.kill();
}
