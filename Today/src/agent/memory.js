/**
 * Today 记住的东西。
 *
 * 没有画像的 Today 对谁都一样，那它就不是「我的」Today。
 *
 * 三条从 zhiji-yida/src/lib/profile/now.ts 搬过来的做法，
 * 以及一条在这里必须不同的：
 *
 * 1) 按维度分，每个维度有自己的效期（ttlDays）。
 *    「Coco是她的孩子」和「Coco明天打疫苗」不是一类东西，
 *    前者永远成立，后者后天就错了。原来存成一类是错的。
 *
 * 2) 过期不删，降级成 stale——注入时标「可能已经过去，用之前先确认一句」。
 *    直接删会丢信息，直接用会说错话，确认一句最稳。
 *
 * 3) 每条带 at（什么时候记的）。她要能看出哪条是旧的。
 *
 * 4) **安全相关的永不过期。** 过敏、忌口、医生交代的话，
 *    过期提醒比不提醒更危险。这条是这里和 now.ts 最大的不同——
 *    那边是工作场景，这边牵涉到一个孩子。
 */

/**
 * 「家里人」原来是这里的第一个维度，现在搬到 people.js 了。
 *
 * 搬之前它和档案并存，于是模型有两个地方可以写同一件事——
 * 问它记住「我老公周末才回来」，它写进了这个维度，档案里一个人都没有。
 * 两个真相来源，它只会选一个，而且不一定选对的那个。
 *
 * 老数据不删：下面 render 时单独列出来，标明是旧的自由文本，
 * 让她有机会把那几句搬进档案。但这个维度不再对模型开放写入。
 */
const RETIRED = ['家里人'];

export const DIMENSIONS = [
  {
    key: '一天的样子',
    hint: '几点送学、什么时候午睡、哪天有固定的事、谁几点回家',
    ttlDays: 180, // 跟着学期和季节变
  },
  {
    key: '在办的事',
    hint: '有期限的、正在推进的：要交的表、要打的针、约好的门诊',
    ttlDays: 21, // 这类过期最快
  },
  {
    key: '她自己',
    hint: '她为自己做过的事、她喜欢什么、她在意什么',
    // 不过期——这是整个产品里最该被记住的东西
  },
  {
    key: '一直推着的',
    hint: '反复出现又没做的事。不是用来追责，是下次好判断什么该放下',
    ttlDays: 60,
  },
  {
    key: '要紧的叮嘱',
    hint: '过敏、忌口、吃药、医生说过的话、不能碰的东西',
    // 永不过期：过期的安全提醒比没有提醒更危险
  },
];

const KEYS = DIMENSIONS.map(d => d.key);
const CAP = 14; // 每个维度的上限。无限增长会撑爆上下文，也会越积越脏。

const DAY = 86400000;
const daysAgo = iso => Math.floor((Date.now() - new Date(iso).getTime()) / DAY);

export const EMPTY = {facts: {}, updatedAt: ''};

/** 这条是不是已经旧到要先确认一句。 */
export function isStale(dim, at) {
  const d = DIMENSIONS.find(x => x.key === dim);
  if (!d?.ttlDays || !at) return false;
  return daysAgo(at) > d.ttlDays;
}

/**
 * 合并新记的东西。只增不删，去重，每维度有上限，新的放前面。
 * 同一条再次被提到会刷新 at —— 她又说了一遍，说明它还成立。
 */
export function merge(cur, add) {
  const now = new Date().toISOString();
  const facts = {...(cur?.facts ?? {})};

  for (const key of KEYS) {
    const incoming = (add?.[key] ?? [])
      .map(t => (typeof t === 'string' ? t : t?.text ?? ''))
      .map(t => t.trim())
      .filter(Boolean);
    if (!incoming.length && !facts[key]) continue;

    const list = [...(facts[key] ?? [])];
    for (const text of incoming) {
      const hit = list.findIndex(f => f.text === text);
      if (hit >= 0) list[hit] = {...list[hit], at: now}; // 又提了一遍 = 还成立
      else list.unshift({text, at: now});
    }
    facts[key] = list
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, CAP);
  }
  return {facts, updatedAt: now};
}

/** 摊成一段给模型看的上下文。 */
export function render(mem, zh) {
  const facts = mem?.facts ?? {};
  const lines = [];
  for (const d of DIMENSIONS) {
    const list = facts[d.key] ?? [];
    if (!list.length) continue;
    lines.push(`### ${d.key}`);
    for (const f of list) {
      const old = isStale(d.key, f.at);
      lines.push(
        `- ${f.text}` +
          (old ? (zh ? '（记录较早，可能已经过去，用之前先确认一句）' : ' (recorded a while ago — confirm before relying on it)') : ''),
      );
    }
  }
  // 搬走的维度里还留着的老话。不进 DIMENSIONS，所以模型不会再往里写，
  // 但也不能就这么看不见了——那等于把她说过的话弄丢了。
  const old = [];
  for (const k of RETIRED) {
    for (const f of facts[k] ?? []) old.push(`- ${f.text}`);
  }
  if (old.length) {
    lines.push(
      zh ? '### 家里人（旧的自由文本，以上面的档案为准）' : '### Family (old free-text notes — the record above wins)',
      ...old,
    );
  }

  if (!lines.length) return '';
  const head = zh
    ? '我已经记着这些（她交代过的，不要再问一遍）：'
    : 'I already remember this (she told me — do not ask again):';
  const body = head + '\n' + lines.join('\n');
  // 上下文会被撑爆，截断。长度上限从 now.ts 那边抄的。
  return body.length > 2400 ? body.slice(0, 2400) + (zh ? '\n（略）' : '\n(truncated)') : body;
}

/** 给界面看的：按维度分组，带「多久以前」和是否已旧。 */
export function forDisplay(mem) {
  const facts = mem?.facts ?? {};
  return DIMENSIONS.map(d => ({
    key: d.key,
    items: (facts[d.key] ?? []).map(f => ({
      text: f.text,
      days: f.at ? daysAgo(f.at) : null,
      stale: isStale(d.key, f.at),
    })),
  })).filter(g => g.items.length);
}

/** 记忆总条数。 */
export const count = mem =>
  Object.values(mem?.facts ?? {}).reduce((n, l) => n + l.length, 0);
