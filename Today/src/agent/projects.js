/**
 * 推着走的事。
 *
 * 「保险那件事」在记忆里躺了三天没动过——不是她不想做，
 * 是不知道从哪儿开始，而每次想起来都要重新想一遍。
 *
 * 四个能力，对应四件必须做对的事：
 *
 *   拆  一件大事拆成几步，**但每天只给一步**。
 *       一次倒四步又变成一张让人发怵的清单。
 *   问  拆之前常常缺一个关键信息（给谁买？续还是新买？）。
 *       **最多问一句**，问多了就变成表格。
 *   接  今天这步做完了，明天自己把下一步放上来。
 *       她不用记「我进行到哪了」——这才是「每天一点点」成立的地方。
 *   守  她自己的事连着几天被挤掉，要主动说一句。
 *       不是催，是它记得这件事被欠着。
 *
 * 一条红线：**不给她看进度条和完成率。**
 * 「保险 2/4 步」会立刻把这个产品变成她又一个要维护的看板。
 * 它只说「今天这一步」，剩下的自己收着。
 */

const DAY = 86400000;
const daysSince = iso => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);

/** 去掉标点和空格，「给Coco办保险，新买」和「给Coco办保险」要能对上。 */
const norm = s => String(s ?? '').replace(/[\s，。、,.:：;；!！?？「」"'()（）]/g, '');

/**
 * 模型写的 id 是人话，不是我生成的那串。它会从记忆里抄一句
 *（「给Coco办保险」就是从「在办的事」里抄的），那条记忆并不是一个项目。
 * 所以 id 对不上的时候按标题再找一遍，找不到就是真没有。
 */
function locate(items, op) {
  if (op.id) {
    const hit = items.find(p => p.id === op.id);
    if (hit) return hit;
  }
  const keys = [op.id, op.title].map(norm).filter(Boolean);
  if (!keys.length) return null;
  return (
    items.find(p => keys.includes(norm(p.title))) ??
    items.find(p => keys.some(k => norm(p.title).includes(k) || k.includes(norm(p.title)))) ??
    null
  );
}

/**
 * @typedef {{
 *   id: string,
 *   title: string,
 *   forHer?: boolean,
 *   steps: {text: string, note?: string, done: boolean, at?: string}[],
 *   asked?: string,
 *   at: string,
 *   lastMoved?: string,
 *   offers?: number,
 *   done?: boolean,
 * }} Project
 */

export const EMPTY = {items: []};

/** 下一步是哪一步。全做完返回 null。 */
export const nextStep = p => p.steps.find(s => !s.done) ?? null;

/** 这件事今天该不该被端出来。 */
export function dueToday(p) {
  if (p.done) return false;
  if (!nextStep(p)) return false;
  // 今天已经端过一步了就不再端——每天只给一步
  return daysSince(p.lastMoved) !== 0;
}

/**
 * 挑今天要推进的那一件。
 *
 * 优先她自己的事：它们永远排最后、永远被挤掉，
 * 所以这里反过来——越被欠着越先端。
 */
export function pickForToday(list) {
  const due = (list ?? []).filter(dueToday);
  if (!due.length) return null;
  const score = p =>
    (p.forHer ? 1000 : 0) + (daysSince(p.lastMoved ?? p.at) ?? 0);
  return due.sort((a, b) => score(b) - score(a))[0];
}

/** 被欠着太久的她自己的事。守。 */
/**
 * 她自己的事卡住了。
 *
 * 两种卡法，都得算上：
 *   同一步端出去三回她还没做——不是她懒，是这步对她来说还是太大，
 *   或者根本没人替她腾出那段时间。
 *   问了她一句，三天没答——这件事就彻底沉了。没有 steps，
 *   「接」永远挑不到它，不在这儿捞一把就再也不会有人提起。
 *
 * 只看她自己的事。给孩子办的事从来不会被忘，忘的总是她自己那件。
 * 响了也不是去催她，是让它有机会被说出口。
 */
export function neglected(list, {offers = 3, asked = 3} = {}) {
  return (list ?? []).filter(p => {
    if (!p.forHer || p.done) return false;
    if (p.asked) return (daysSince(p.at) ?? 0) >= asked;
    return nextStep(p) ? (p.offers ?? 0) >= offers : false;
  });
}

/** 合并模型给的项目改动。只认它明确给的，不猜。 */
export function apply(cur, ops) {
  const items = [...(cur?.items ?? [])];
  const now = new Date().toISOString();

  for (const op of ops ?? []) {
    if (!op?.title && !op?.id) continue;

    // 别信它写的 op，看它手上有什么。
    //
    // 两种真实见过的跑偏：它自己发明 op:"ask"（然后把 title 塞进 id）；
    // 它发 op:"steps" 但 id 是从记忆里抄来的一句话，我这儿根本没这个项目。
    // 两种都曾被静默丢掉——她说了一句掏心窝的话，什么都没发生。
    //
    // 所以：先按语义找到它指的那件事，再按「找着没有、带了什么」定行为。
    const found = locate(items, op);
    const kind =
      !found ? (op.title ? 'new' : 'skip')      // 没这件事：有名字才能建，没名字没法叫它
      : op.op === 'step-done' ? 'step-done'
      : op.op === 'drop' || op.op === 'done' ? 'drop'
      : op.steps?.length ? 'steps'                                   // 有这件事且带来了拆解
      : 'skip';                                                      // 没带新东西，别覆盖

    // 新建
    if (kind === 'new') {
      const id = `p${Date.now().toString(36)}${items.length}`;
      const p = {
        id,
        title: String(op.title).trim(),
        forHer: op.forHer === true,
        steps: (op.steps ?? []).map(s => ({
          text: String(typeof s === 'string' ? s : s.text ?? '').trim(),
          note: typeof s === 'object' && s.note ? String(s.note).trim() : undefined,
          done: false,
        })).filter(s => s.text),
        asked: op.ask ? String(op.ask).trim() : undefined,
        at: now,
      };
      if (p.title) items.push(p);
      continue;
    }

    const p = found;
    if (!p) continue;

    // 补上拆解（之前只问了一句，还没拆）
    if (kind === 'steps' && op.steps?.length) {
      p.steps = op.steps.map(s => ({
        text: String(typeof s === 'string' ? s : s.text ?? '').trim(),
        note: typeof s === 'object' && s.note ? String(s.note).trim() : undefined,
        done: false,
      })).filter(s => s.text);
      p.asked = undefined;
    }
    // 这一步做完了
    if (kind === 'step-done') {
      const s = nextStep(p);
      if (s) { s.done = true; s.at = now; }
      p.offers = 0;                       // 新的一步，重新数
      if (!nextStep(p)) p.done = true;
    }
    // 整件事不做了 / 做完了
    if (kind === 'drop' || kind === 'done') p.done = true;
  }
  return {items};
}

/** 端出一步之后记一笔，今天就不再端这件事了。 */
/**
 * 今天把这一步端出去了。
 *
 * 「端出去过」和「往前走了」是两件事，必须分开记——
 * 不分开的话 lastMoved 每天都被刷新，一件搁了半个月的事看上去永远是新的，
 * 「守」就永远不会响。offers 是同一步被端出去几次，她做完才归零。
 */
export function markMoved(cur, id) {
  const items = (cur?.items ?? []).map(p =>
    p.id === id
      ? {...p, lastMoved: new Date().toISOString(), offers: (p.offers ?? 0) + 1}
      : p,
  );
  return {items};
}

/** 摊给模型看。只给它需要判断的那些，不给全部历史。 */
export function render(store, zh) {
  const live = (store?.items ?? []).filter(p => !p.done);
  if (!live.length) return '';
  const lines = live.map(p => {
    const s = nextStep(p);
    const left = p.steps.filter(x => !x.done).length;
    const tag = p.forHer ? (zh ? '（给她自己的）' : ' (hers)') : '';
    if (p.asked) {
      return zh
        ? `- [${p.id}] ${p.title}${tag} — 还没拆，我问过她：「${p.asked}」`
        : `- [${p.id}] ${p.title}${tag} — not broken down yet; I asked: "${p.asked}"`;
    }
    return zh
      ? `- [${p.id}] ${p.title}${tag} — 下一步：${s?.text ?? '（没有了）'}，还剩 ${left} 步`
      : `- [${p.id}] ${p.title}${tag} — next: ${s?.text ?? '(none)'}, ${left} left`;
  });
  return (zh ? '我在替她推着的事：\n' : "Things I'm moving along for her:\n") + lines.join('\n');
}
