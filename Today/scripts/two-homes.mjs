/**
 * 第六幕那三十秒：同一个问题、同一批搜索结果，两个家庭。
 *
 * 为什么要单独写一个脚本跑：这一幕的说服力全在「变量只有一个」。
 * 如果两家各自去搜一次，搜回来的东西本来就不一样，那它们答得不同
 * 就什么都没证明——可能只是搜索结果不同而已。
 *
 * 所以这里**搜一次，喂两家**。两边的提示词只差一样东西：家里有谁。
 *
 *   node scripts/two-homes.mjs
 *
 * 要先有两份数据：
 *   TODAY_DATA=.data.demo  node scripts/demo-seed.mjs
 *   TODAY_DATA=.data.demo2 node scripts/demo-seed.mjs --other
 */
import {readFileSync, existsSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// 和服务端读同一个文件，别让脚本有自己一套密钥来源
for (const line of readFileSync(join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m && m[2]) process.env[m[1]] ||= m[2].replace(/^["']|["']$/g, '');
}

const {buildMessages} = await import(join(ROOT, 'src/agent/prompt.js'));
const Web = await import(join(ROOT, 'src/agent/search.js'));

const read = (dir, file, dflt) => {
  const p = join(ROOT, dir, file);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : dflt;
};

const BASE = process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1';
const MODEL = process.env.TODAY_MODEL || 'MiniMaxAI/MiniMax-M3';

async function call(messages) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEBIUS_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL, messages,
      temperature: 0.4, top_p: 0.88,
      response_format: {type: 'json_object'},
    }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
  const raw = (await r.json()).choices?.[0]?.message?.content ?? '';
  const body = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw;
  return JSON.parse(body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1));
}

const Q = 'where can I take them this Saturday? somewhere indoors';
const PLACE = {name: 'Brooklyn, US'};

const shared = await Web.search(
  'indoor things to do with children in Brooklyn on a Saturday', {place: PLACE});
if (!shared.length) {
  console.error('搜索空手回来了。TAVILY_API_KEY 在不在？再跑一次。');
  process.exit(1);
}
console.log(`同一批搜索结果 ${shared.length} 条，两家共用：`);
for (const s of shared) console.log('  ·', s.title);
console.log();

const HOMES = [
  ['① Coco 八个月 / Stelle 十五岁', '.data.demo'],
  ['② Jonah 十岁 / Ada 十二岁',     '.data.demo2'],
];

for (const [who, dir] of HOMES) {
  if (!existsSync(join(ROOT, dir))) {
    console.error(`${dir} 不在。先跑 demo-seed.mjs。`);
    process.exit(1);
  }
  const msgs = buildMessages({
    braindump: Q,
    now: new Date().toISOString().slice(0, 16).replace('T', ' '),
    lang: 'en',
    memory: read(dir, 'memory.json', {facts: {}}),
    projects: read(dir, 'projects.json', {items: []}),
    people: read(dir, 'people.json', {people: []}),
    place: read(dir, 'prefs.json', {}).place ?? PLACE,
  });
  // 第一轮它会说「我去查一下」，第二轮才是读过材料之后的判断
  const first = await call(msgs);
  const out = await call([
    ...msgs,
    {role: 'assistant', content: JSON.stringify(first)},
    {role: 'user', content: Web.render(shared, false)},
  ]);
  console.log(who);
  console.log('  ' + String(out.say ?? '').replace(/\n/g, '\n  '));
  console.log();
}
