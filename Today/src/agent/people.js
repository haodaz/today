/**
 * 家里人。
 *
 * 这块本来混在记忆里，是一行自由文本：「Coco，三岁，上小班，每天八点送」。
 * 三个毛病都是从那一行来的：
 *
 *   「三岁」会烂。记下来那天是真的，一年后还是三岁，而且没人会发现——
 *   这个维度不过期，所以它会一直错下去。存生日就不会，年龄每次现算。
 *
 *   名字每次重猜。同一轮里出现过 Coco、KeKe、Buying Insurance for Coco——
 *   中文名怎么写成英文，模型每次都重新发明一遍。英文名是她定的，不是猜的。
 *
 *   性别靠猜。「趁她睡着」——Coco是男孩。档案里没有的东西，
 *   模型不会空着，它会填一个。
 *
 * 所以家里人要结构化：**低频变化的东西存字段，高频变化的东西算出来。**
 * 孩子不天天改名，大人不天天生孩子；但年龄天天在变，上几年级年年在变。
 *
 * 一条边界：这里只存「是谁」。谁几点送学、谁周三来帮忙，那是「一天的样子」，
 * 不在这儿——那些会变，放进档案就等于又造了一个会烂的字段。
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   en?: string,
 *   rel?: string,
 *   role?: string,
 *   born?: string,
 *   approx?: boolean,
 *   they?: 'he' | 'she' | 'they',
 *   note?: string,
 * }} Person
 */

export const EMPTY = {people: []};

/**
 * 家里有谁，由她说了算。
 *
 * 不做「母亲/父亲」这种单选字段——两个妈妈、两个爸爸的家庭会被那种字段
 * 直接判定为填错了。角色可以重复，想加几个加几个。
 *
 * 猫和狗也在里面。只能填「家长 + 孩子」的产品是在替她定义什么算家庭；
 * 能把 Nana 加进去，这块屏才是她家的。
 */
export const ROLES = [
  {key: 'mum',  icon: '\u{1F469}', zh: '妈妈', en: 'Mum'},
  {key: 'dad',  icon: '\u{1F468}', zh: '爸爸', en: 'Dad'},
  {key: 'baby', icon: '\u{1F476}', zh: '宝宝', en: 'Baby'},
  {key: 'kid',  icon: '\u{1F9D2}', zh: '孩子', en: 'Child'},
  {key: 'gran', icon: '\u{1F475}', zh: '老人', en: 'Grandparent'},
  {key: 'cat',  icon: '\u{1F431}', zh: '猫',   en: 'Cat'},
  {key: 'dog',  icon: '\u{1F436}', zh: '狗',   en: 'Dog'},
  {key: 'me',   icon: '\u2764\uFE0F', zh: '我', en: 'Me'},
];

export const iconOf = role =>
  ROLES.find(r => r.key === role)?.icon ?? '\u{1F9D1}';

const MONTH = 'months';

/**
 * 活了多少个月。
 *
 * born 可以只给年、给到月、给到日——她多半只记得「二三年四月」。
 * 只给年就按年中算：宁可模糊，也不要假装精确到天。
 */
export function monthsOld(born, now = new Date()) {
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(String(born ?? '').trim());
  if (!m) return null;
  const y = +m[1];
  const mo = m[2] ? +m[2] : 7;        // 只给年份 → 按年中
  const d = m[3] ? +m[3] : 15;
  if (mo < 1 || mo > 12) return null;
  const then = new Date(y, mo - 1, d);
  if (Number.isNaN(+then) || then > now) return null;
  let n = (now.getFullYear() - y) * 12 + (now.getMonth() - (mo - 1));
  if (now.getDate() < d) n -= 1;      // 这个月的生日还没到
  return n < 0 ? null : n;
}

/**
 * 几岁。两岁以内按月说——当妈的不会说「我孩子一岁」，会说「十四个月」。
 */
export function ageText(born, zh, now = new Date()) {
  const n = monthsOld(born, now);
  if (n == null) return '';
  if (n < 1) return zh ? '还不到一个月' : 'under a month old';
  if (n < 24) return zh ? `${n} 个月` : `${n} ${MONTH}`;
  const y = Math.floor(n / 12);
  return zh ? `${y} 岁` : `${y} years old`;
}

/**
 * 她说「五岁」的时候。
 *
 * 模型不该做这个换算——让它算，它会编一个「2021-03-15」出来，
 * 从此没人知道那个月份是猜的。它只报告她说了几岁，换算归这里，
 * 而且只算到年、标上 approx：差一岁是知道的，假装精确才是错的。
 *
 * 好处是这个数会自己长。存「五岁」明年还是五岁，存 2021 明年就是六岁。
 */
function bornFromAge(age, now) {
  const n = Number(age);
  if (!Number.isFinite(n) || n < 0 || n > 120) return null;
  return String(now.getFullYear() - Math.floor(n));
}

/** 把年龄从 note 里摘掉。写进去就冻住了，明年就是错的。 */
const stripAge = t => {
  const out = String(t ?? '')
    .replace(/[0-9０-９一二三四五六七八九十两]+\s*(岁|个月|周岁)[，,、]?\s*/g, '')
    .replace(/\b\d+\s*(years?\s*old|months?\s*old|yo)\b[,，]?\s*/gi, '')
    .replace(/^[，,、\s]+|[，,、\s]+$/g, '');
  return out || undefined;
};

const slug = () => `h${Date.now().toString(36)}${Math.floor(Math.random() * 1e3)}`;
const clean = v => (v == null ? undefined : String(v).trim() || undefined);
const norm = s => String(s ?? '').replace(/[\s·、,.，。]/g, '').toLowerCase();

/** 按 id 找，找不到按名字（中文名或英文名）找。模型写的 id 常常是人话。 */
function locate(list, op) {
  if (op.id) {
    const hit = list.find(p => p.id === op.id);
    if (hit) return hit;
  }
  const keys = [op.id, op.name, op.en].map(norm).filter(Boolean);
  if (!keys.length) return null;
  return list.find(p => keys.includes(norm(p.name)) || (p.en && keys.includes(norm(p.en)))) ?? null;
}

/**
 * 改档案。
 *
 * 只认两个 op：set（新建或改）和 drop。
 * 和 projects 一样的教训：别信它写的 op，看它手上有什么——
 * id 对不上就按名字找，还是没有就是个新人。
 *
 * **只改它给了的字段。** 它说「Coco上中班了」时不会把生日再抄一遍，
 * 整条覆盖就等于把生日抹了。
 */
export function apply(cur, ops, now = new Date()) {
  const people = [...(cur?.people ?? [])];
  for (const op of ops ?? []) {
    if (!op || typeof op !== 'object') continue;
    const found = locate(people, op);

    if (op.op === 'drop') {
      if (found) people.splice(people.indexOf(found), 1);
      continue;
    }
    const born = clean(op.born);
    // 她给了确切生日就用确切的；只说了岁数就按年倒推，并且标明是估的。
    const guess = born ? null : bornFromAge(op.age, now);
    const patch = {
      name: clean(op.name),
      en: clean(op.en),
      rel: clean(op.rel),
      role: ROLES.some(r => r.key === op.role) ? op.role : undefined,
      born: born ?? guess ?? undefined,
      // 只给了年份就一定是估的——「2023」本身就说不出月份。
      // 不这么判的话，界面把推算出来的年份显示在生日栏里，她一按存下，
      // 一个猜出来的数就变成了确定的事实，而且从此看不出是猜的。
      approx: born ? !/^\d{4}-\d{1,2}/.test(born) : guess ? true : undefined,
      they: ['he', 'she', 'they'].includes(op.they) ? op.they : undefined,
      note: stripAge(clean(op.note)),
    };
    if (found) {
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) found[k] = v;
      continue;
    }
    if (!patch.name) continue;        // 没名字就不是一个人，别建
    people.push({id: slug(), ...Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )});
  }
  return {people};
}

/**
 * 给模型看的。
 *
 * 年龄是现算的，不存；档案里只有生日。
 * 没写性别就明说「不知道」——不说的话它会自己挑一个，
 * 然后把一个男孩叫成 she。
 */
export function render(store, zh, now = new Date()) {
  const list = store?.people ?? [];
  if (!list.length) return '';
  const lines = list.map(p => {
    const bits = [];
    const r = ROLES.find(x => x.key === p.role);
    if (r) bits.push(zh ? r.zh : r.en);
    if (p.rel && p.rel !== (zh ? r?.zh : r?.en)) bits.push(p.rel);
    const age = ageText(p.born, zh, now);
    if (age) bits.push(p.approx ? (zh ? `${age}左右` : `about ${age}`) : age);
    if (p.they) bits.push(zh ? `称 ${p.they}` : `goes by ${p.they}`);
    else bits.push(zh ? '性别没说过' : 'pronoun not known — use they');
    if (p.note) bits.push(p.note);
    // 英文下用她定的英文名打头——这个字段存在的理由就是别再每次重猜一遍。
    // 中文名跟在后面，她说「Coco」的时候模型得能对上同一个人。
    if (zh) {
      if (p.en) bits.splice(2, 0, `英文名 ${p.en}`);
      return `- ${p.name}（${bits.join('，')}）`;
    }
    const head = p.en ? `${p.en} (${p.name} in Chinese)` : p.name;
    return `- ${head} — ${bits.join(', ')}`;
  });
  const head = zh
    ? '家里人（这是档案，比记忆里写的准。名字、年龄、怎么称呼都以这里为准）：'
    : 'The family (this is the record — it beats anything in the remembered notes. ' +
      'Take names, ages and pronouns from here):';
  return head + '\n' + lines.join('\n');
}

/** 给界面看的：原样给出去，年龄另算一份。 */
export function forDisplay(store, zh = true, now = new Date()) {
  return (store?.people ?? []).map(p => {
    const mo = monthsOld(p.born, now);
    return {
      ...p,
      age: ageText(p.born, zh, now),
      icon: iconOf(p.role),
      // 界面要分开处理：生日是她填的，岁数是算出来的。
      // 估出来的年份不能回填到生日栏里让她去确认。
      ageNum: mo == null ? null : Math.floor(mo / 12),
    };
  });
}

export const count = store => (store?.people ?? []).length;
