/**
 * 服务在哪儿。
 *
 * 原来是一行写死的 `http://192.168.1.243:8910`。只要路由器重启、DHCP 租约过期、
 * 或者换个网络，这块屏就全瞎——而且**必须重新打包重装 APK 才能救**。
 * 一台挂在墙上整天开着的电视，不该因为路由器重启一次就要接电脑。
 *
 * 所以：先试上次能用的那个，不行就在同一网段里找一遍。
 * 路由器重启最常见的结果是同网段换了个号（.243 → .244），
 * 扫一遍 /24 就能把这种情况全接住。
 *
 * 不引入新依赖（AsyncStorage / mDNS 都要重新打包，这个节骨眼不值得），
 * 所以记在内存里：这一次开机之内不会重复扫。冷启动再扫一次，
 * 几秒钟的事，比一块死掉的屏好。
 */

/** 打包时写进去的那个。多数时候它就是对的，先试它。 */
export const DEFAULT_API = 'http://192.168.1.243:8910';
const PORT = 8910;

/** 一次探几台。电视性能有限，别一口气几百个请求压上去。 */
const BATCH = 32;
/** 单台超时。局域网内活着的机器几十毫秒就回，给到半秒已经很宽。 */
const PROBE_MS = 600;

let resolved: string | null = null;
let working: Promise<string> | null = null;

/** 这台在不在。/where 最便宜，不碰模型也不写盘。 */
async function alive(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/where`, {
      signal: AbortSignal.timeout(PROBE_MS),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** 从 http://a.b.c.d:port 里取出 a.b.c. */
function subnetOf(base: string): string | null {
  const m = /^https?:\/\/(\d+)\.(\d+)\.(\d+)\.\d+/.exec(base);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

async function scan(subnet: string): Promise<string | null> {
  for (let start = 1; start < 255; start += BATCH) {
    const batch: Promise<string | null>[] = [];
    for (let i = start; i < Math.min(start + BATCH, 255); i++) {
      const base = `http://${subnet}.${i}:${PORT}`;
      batch.push(alive(base).then(ok => (ok ? base : null)));
    }
    const hit = (await Promise.all(batch)).find(Boolean);
    if (hit) return hit;
  }
  return null;
}

/**
 * 找到服务，返回它的地址。
 *
 * 并发调用只会跑一次——开机时好几处都要用这个地址，
 * 不能每处都去扫一遍网段。
 */
export function resolveApi(): Promise<string> {
  if (resolved) return Promise.resolve(resolved);
  if (working) return working;

  working = (async () => {
    if (await alive(DEFAULT_API)) return DEFAULT_API;

    // 同网段换了个号，这是路由器重启之后最常见的情况
    const own = subnetOf(DEFAULT_API);
    if (own) {
      const hit = await scan(own);
      if (hit) return hit;
    }
    // 换了路由器 / 换了网络，再试两个最常见的家用网段
    for (const net of ['192.168.0', '192.168.1', '10.0.0']) {
      if (net === own) continue;
      const hit = await scan(net);
      if (hit) return hit;
    }
    // 找不到就还给默认值：下一轮轮询会再试，不要让整块屏炸掉
    return DEFAULT_API;
  })();

  const p = working.then(url => {
    resolved = url;
    working = null;
    return url;
  });
  return p;
}

/** 已经找到的那个。还没找到就先给默认值，调用方自己会重试。 */
export const apiNow = () => resolved ?? DEFAULT_API;

/** 这个地址不灵了（请求连着失败），下次重新找。 */
export function forgetApi() {
  resolved = null;
  working = null;
}
