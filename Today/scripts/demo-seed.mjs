/**
 * 公开素材用的虚构档案。
 *
 * 落地页截图和 demo 视频里的内容本身就是家庭数据——
 * 跟有没有拍到房间是两回事。所以公开素材一律跑在这份虚构的上，
 * 她日常那份一个字节都不碰。
 *
 *   TODAY_DATA=.data.demo  node scripts/demo-seed.mjs
 *   TODAY_DATA=.data.demo2 node scripts/demo-seed.mjs --other
 *   TODAY_DATA=.data.demo  node server/index.mjs
 *
 * --other 是第六幕对比用的第二个家庭：同一个城市、同一批搜索结果，
 * 只有孩子的年龄不同。两家不在同一个城市，那一幕的前提就不成立了。
 *
 * 里面的人和事全是编的。叮嘱那条特意避开了任何真实孩子身上的情况——
 * 从演示数据反推不出任何一个真人。
 */
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = process.env.TODAY_DATA
  ? (process.env.TODAY_DATA.startsWith('/')
      ? process.env.TODAY_DATA
      : join(ROOT, process.env.TODAY_DATA))
  : join(ROOT, '.data.demo');

if (DATA.endsWith('/.data')) {
  console.error('不往 .data 里写——那是她真实的那份。设 TODAY_DATA 换一个目录。');
  process.exit(1);
}

for (const d of [DATA, join(DATA, 'days')]) if (!existsSync(d)) mkdirSync(d, {recursive: true});

const now = new Date();
const iso = d => new Date(now.getTime() - d * 86400000).toISOString();
const put = (name, v) => {
  writeFileSync(join(DATA, name), JSON.stringify(v, null, 2));
  console.log('  ', name);
};

const OTHER = process.argv.includes('--other');

put('prefs.json', {lang: 'en', place: {name: 'Brooklyn, US', lat: 40.6501, lon: -73.9496}});

if (OTHER) {
  // 第二个家庭。同城、同一批搜索结果，孩子的年龄完全不同——
  // 第六幕要证明的就是「同样的结果，不同的家，答案相反」。
  put('people.json', {
    people: [
      {id: 'o-mum',   name: 'Dana',  role: 'mum', rel: 'mum', they: 'she'},
      {id: 'o-jonah', name: 'Jonah', role: 'kid', rel: 'son', they: 'he',
       born: '2016-05', approx: false, note: 'fifth grade, soccer on Saturdays'},
      {id: 'o-ada',   name: 'Ada',   role: 'kid', rel: 'daughter', they: 'she',
       born: '2014-02', approx: false, note: 'seventh grade'},
    ],
  });
  put('memory.json', {
    facts: {
      '一天的样子': [
        {text: 'Jonah has soccer Saturday mornings; both out the door by 7:45', at: iso(20)},
      ],
      '她自己': [{text: 'back at work three days a week', at: iso(30)}],
      '要紧的叮嘱': [
        {text: 'Ada needs her glasses for anything she has to read', at: iso(60)},
      ],
    },
    updatedAt: iso(0),
  });
  put('projects.json', {items: []});
  console.log('\n第二个家庭写好了（第六幕对比用）：', DATA);
  process.exit(0);
}


// 一个孩子就够。两个会把每块屏都填满，看不出结构。
put('people.json', {
  people: [
    {id: 'demo-elodie', name: 'Elodie', role: 'mum',  rel: 'mum',      they: 'she'},
    {id: 'demo-claude', name: 'Claude', role: 'dad',  rel: 'dad',      they: 'he',
     note: 'travels Tuesday to Thursday most weeks'},
    // 生日写到日，年龄让它自己算。note 里绝不写岁数——
    // 写了就会和算出来的打架，而且明年还是错的。
    {id: 'demo-coco',   name: 'Coco',   role: 'baby', rel: 'daughter', they: 'she',
     born: '2026-02-01', approx: false},
    {id: 'demo-stelle', name: 'Stelle', role: 'kid',  rel: 'daughter', they: 'she',
     born: '2011-03', approx: false, note: 'tenth grade, PSAT in the spring'},
    {id: 'demo-nana',   name: 'Nana',   role: 'dog',  rel: 'dog',
     born: '2021-05', approx: false},
  ],
});

put('memory.json', {
  facts: {
    '一天的样子': [
      {text: 'Stelle catches the 7:20 bus; Coco naps around 9:30 and again at 1:30', at: iso(24)},
      {text: 'Claude travels Tuesday to Thursday most weeks', at: iso(31)},
    ],
    '在办的事': [
      {text: "Stelle's parent–teacher conference is Thursday", at: iso(4)},
    ],
    '她自己': [
      {text: "hasn't been out on her own since Coco was born", at: iso(12)},
    ],
    '一直推着的': [
      {text: 'the insurance has been sitting since spring', at: iso(40)},
    ],
    // 永不过期的那一类。电视上排在最前，因为厨房那一眼要的就是它。
    '要紧的叮嘱': [
      {text: 'Coco goes down on her back, never her front', at: iso(120)},
    ],
  },
  updatedAt: iso(0),
});

put('projects.json', {
  items: [
    {
      // 拆过了，第一步做完了，今天该端第二步出来
      id: 'demo-ins',
      title: 'Add Coco to the health plan',
      forHer: false,
      steps: [
        {text: "Find Coco's birth certificate and take a photo of it", note: 'during the morning nap', done: true, at: iso(2)},
        {text: 'Compare two plans — premium, deductible, pediatrician in network', note: 'once Coco is down', done: false},
        {text: 'Submit the enrollment form', done: false},
      ],
      at: iso(40),
      lastMoved: iso(2),
      offers: 1,
    },
    {
      // 她自己的事，端出去三回了还没动 —— 这就是「守」会响的那一件
      id: 'demo-dentist',
      title: 'See the dentist',
      forHer: true,
      steps: [{text: "Call the dentist and take the first morning they've got", done: false}],
      at: iso(23),
      lastMoved: iso(1),
      offers: 3,
    },
  ],
});

/**
 * 过去几天聊过的。
 *
 * 一块空荡荡的历史，等于告诉她这东西今天才装上。
 * 有过去，它才像一直在这儿——而「它一直在这儿」正是这个产品的全部主张。
 *
 * 这几段是编的，但编得像真的：她说话是碎的、带情绪的、不整理的；
 * 它答得短，接住事情，不说漂亮话。
 */
const dayKey = d => d.toLocaleDateString('sv-SE');
const at = (d, h, m) => {
  const x = new Date(Date.now() - d * 86400000);
  x.setHours(h, m, 0, 0);
  return x.toISOString();
};

const PAST = [
  [1, [
    [9, 20, 'her', 'Coco was up half the night, I am wrecked'],
    [9, 20, 'today', "Then today stays small. Stelle's conference isn't until Thursday — it can wait."],
    [14, 5, 'her', 'she went down at one and I actually sat down'],
    [14, 5, 'today', 'Good. I moved the shopping to tomorrow so that hour stays yours.'],
  ]],
  [3, [
    [8, 40, 'her', 'I keep meaning to sort the insurance and never do'],
    [8, 40, 'today', "I'm holding that one. Is it just Coco, or Stelle too?"],
    [8, 52, 'her', "just Coco — Stelle's already on it"],
    [8, 52, 'today', "Got it — Coco only. I've broken it into four, and I'll give you one at a time."],
  ]],
  [6, [
    [19, 10, 'her', "my tooth's been bothering me for a week and I keep not calling"],
    [19, 10, 'today', "I've got it. Not today — but I'm not letting it slide either."],
  ]],
  [9, [
    [7, 55, 'her', 'Stelle needs her kit washed for tomorrow and I will forget'],
    [7, 55, 'today', "You won't — I'll put it in front of you tonight, not in the morning."],
  ]],
];

for (const [ago, turns] of PAST) {
  const d = new Date(Date.now() - ago * 86400000);
  const messages = turns.map(([h, m, who, text]) => ({who, text, at: at(ago, h, m)}));
  // 一天里可能聊过几轮，按说话的间隔切开
  const threads = [];
  let cur = [];
  for (const msg of messages) {
    if (cur.length && msg.who === 'her' &&
        new Date(msg.at) - new Date(cur[cur.length - 1].at) > 60 * 60 * 1000) {
      threads.push({at: cur[0].at, messages: cur});
      cur = [];
    }
    cur.push(msg);
  }
  if (cur.length) threads.push({at: cur[0].at, messages: cur});
  writeFileSync(
    join(DATA, 'days', `${dayKey(d)}.json`),
    JSON.stringify({date: dayKey(d), messages: [], threads}, null, 2),
  );
}
console.log(`   聊过的：${PAST.length} 天`);

console.log('\n虚构档案写好了：', DATA);
console.log('人和事全是编的，反推不到任何真人。');
