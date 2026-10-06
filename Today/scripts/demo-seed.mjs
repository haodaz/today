/**
 * 公开素材用的虚构档案。
 *
 * 落地页截图和 demo 视频里的内容本身就是家庭数据——
 * 跟有没有拍到房间是两回事。所以公开素材一律跑在这份虚构的上，
 * 她日常那份一个字节都不碰。
 *
 *   TODAY_DATA=.data.demo node scripts/demo-seed.mjs
 *   TODAY_DATA=.data.demo node server/index.mjs
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

put('prefs.json', {lang: 'en'});

// 一个孩子就够。两个会把每块屏都填满，看不出结构。
put('people.json', {
  people: [
    {
      id: 'demo-coco',
      name: 'Coco',
      rel: 'daughter',
      born: '2022-03',
      approx: false,
      they: 'she',
      note: 'nursery, mornings',
    },
  ],
});

put('memory.json', {
  facts: {
    '一天的样子': [
      {text: 'nursery drop-off at 8:30, pickup at four', at: iso(26)},
    ],
    '在办的事': [
      {text: 'nursery consent form due Wednesday', at: iso(3)},
    ],
    '她自己': [
      {text: "hasn't been out on her own in weeks", at: iso(11)},
    ],
    '一直推着的': [
      {text: 'the insurance has been sitting since spring', at: iso(40)},
    ],
    // 永不过期的那一类。电视上排在最前，因为厨房那一眼要的就是它。
    '要紧的叮嘱': [
      {text: "Coco's inhaler goes in her bag on nursery days", at: iso(90)},
    ],
  },
  updatedAt: iso(0),
});

put('projects.json', {
  items: [
    {
      // 拆过了，第一步做完了，今天该端第二步出来
      id: 'demo-ins',
      title: 'Insurance for Coco',
      forHer: false,
      steps: [
        {text: "Find Coco's birth certificate and photograph it", note: 'while she naps', done: true, at: iso(2)},
        {text: 'Compare two child health plans, write down the premiums', note: 'after bedtime', done: false},
        {text: 'Fill in the application and send it', done: false},
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
      steps: [{text: 'Ring the surgery and ask for the first free morning', done: false}],
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
    [9, 20, 'her', 'Coco was up half the night coughing, I am wrecked'],
    [9, 20, 'today', "Then today stays small. The form can wait till Wednesday — it's not due before that."],
    [14, 5, 'her', "she's brighter this afternoon, we went to the park"],
    [14, 5, 'today', 'Good. I moved the shopping to tomorrow so this afternoon stays yours.'],
  ]],
  [3, [
    [8, 40, 'her', 'I keep meaning to sort the insurance and never do'],
    [8, 40, 'today', "I'm holding that one. Is it just for Coco, or for you as well?"],
    [8, 52, 'her', 'just for her, we have never had one'],
    [8, 52, 'today', "Right — first policy for Coco. I've broken it into four, and I'll give you one at a time."],
  ]],
  [6, [
    [19, 10, 'her', 'my tooth has been going for a week and I keep not ringing'],
    [19, 10, 'today', "I've got it. Not today — but I'm not letting it slide either."],
  ]],
  [9, [
    [7, 55, 'her', 'nursery said bring wellies tomorrow, I will forget'],
    [7, 55, 'today', "You won't — I'll put it in front of you in the morning."],
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
