/**
 * 天气。
 *
 * 酒店大堂那块板子上第一样东西就是天气，而我们这块屏上一直没有。
 * 「进门、做饭、出门前」那三眼里，出门前那一眼最想知道的就是：
 * 要不要带伞、孩子要不要加件衣服。
 *
 * 所以这里**不做天气面板**。不要小时图、不要体感温度、不要空气质量——
 * 一块整天开着的屏上多一个数字，就多一样要看的东西。
 * 只给两样：今天几度到几度，以及**一句真的会改变她出门动作的话**。
 *
 * 数据来自 Open-Meteo：免费、不要 key、不要账号。
 * 位置是她自己设的，而且只到城市一级——一块客厅里的屏不需要知道她在哪条街。
 */

/** WMO 天气代码。只分到「她需要分」的粒度，不照抄气象学分类。 */
const KIND = [
  [[0], 'clear'],
  [[1, 2, 3], 'cloud'],
  [[45, 48], 'fog'],
  [[51, 53, 55, 56, 57], 'drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'],
  [[71, 73, 75, 77, 85, 86], 'snow'],
  [[95, 96, 99], 'storm'],
];

const WORD = {
  zh: {clear: '晴', cloud: '多云', fog: '有雾', drizzle: '小雨', rain: '有雨', snow: '有雪', storm: '雷雨'},
  en: {clear: 'Clear', cloud: 'Cloudy', fog: 'Fog', drizzle: 'Drizzle', rain: 'Rain', snow: 'Snow', storm: 'Storms'},
};

export const kindOf = code => KIND.find(([cs]) => cs.includes(code))?.[1] ?? 'cloud';

/**
 * 那一句话。
 *
 * 只在真的该改变动作时才给——没事可说就返回空，宁可那一行不出现，
 * 也不要凑一句「今天天气不错」。她不需要一块屏来跟她寒暄。
 */
export function hint(w, zh) {
  if (!w) return '';
  const k = w.kind;
  const wet = k === 'rain' || k === 'storm' || k === 'drizzle';
  const rainy = (w.rainChance ?? 0) >= 50;

  if (k === 'storm') return zh ? '有雷雨，出门前再看一眼' : 'Storms about — check before you set out';
  if (wet || rainy) return zh ? '会下雨，伞放门口' : 'Rain today — umbrella by the door';
  if (k === 'snow') return zh ? '有雪，路上留神' : 'Snow — mind the pavements';
  if (w.low != null && w.low <= 5) return zh ? '早上冷，外套厚一点' : 'Cold this morning — the thicker coat';
  if (w.high != null && w.high >= 30) return zh ? '今天热，水带够' : 'Hot today — take enough water';
  if (k === 'fog') return zh ? '有雾，出门早一点' : 'Fog — leave a little earlier';
  return '';   // 没什么要提醒的，那就什么都不说
}

/** 电视上那一行：晴 · 14°～26°。短到和日期并排放得下。 */
export function line(w, zh) {
  if (!w) return '';
  const word = WORD[zh ? 'zh' : 'en'][w.kind] ?? '';
  const r =
    w.low != null && w.high != null
      ? `${Math.round(w.low)}°–${Math.round(w.high)}°`
      : w.now != null
        ? `${Math.round(w.now)}°`
        : '';
  return [word, r].filter(Boolean).join(' · ');
}

/** 给模型的一句。拿不到就给空串，让它当这件事不存在。 */
export function render(w, zh) {
  if (!w) return '';
  const h = hint(w, zh);
  const head = zh ? `今天的天气：${line(w, zh)}` : `Today's weather: ${line(w, zh)}`;
  return h ? `${head}。${h}` : head;
}

/** 地名 → 坐标。只取第一个结果，城市一级就够。 */
export async function locate(name) {
  const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
  u.searchParams.set('name', name);
  u.searchParams.set('count', '1');
  u.searchParams.set('format', 'json');
  const r = await fetch(u, {signal: AbortSignal.timeout(8000)});
  const hit = (await r.json())?.results?.[0];
  if (!hit) return null;
  return {
    name: [hit.name, hit.country_code].filter(Boolean).join(', '),
    lat: hit.latitude,
    lon: hit.longitude,
  };
}

/** 取今天的天气。失败就返回 null——这块屏上少一行，比显示一个错的好。 */
export async function fetchWeather(place) {
  if (!place?.lat || !place?.lon) return null;
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude', String(place.lat));
  u.searchParams.set('longitude', String(place.lon));
  u.searchParams.set('current', 'temperature_2m,weather_code');
  u.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code');
  u.searchParams.set('forecast_days', '1');
  u.searchParams.set('timezone', 'auto');
  const r = await fetch(u, {signal: AbortSignal.timeout(8000)});
  if (!r.ok) return null;
  const d = await r.json();
  const code = d?.daily?.weather_code?.[0] ?? d?.current?.weather_code;
  if (code == null) return null;
  return {
    place: place.name ?? '',
    kind: kindOf(code),
    now: d?.current?.temperature_2m ?? null,
    high: d?.daily?.temperature_2m_max?.[0] ?? null,
    low: d?.daily?.temperature_2m_min?.[0] ?? null,
    rainChance: d?.daily?.precipitation_probability_max?.[0] ?? null,
    at: new Date().toISOString(),
  };
}
