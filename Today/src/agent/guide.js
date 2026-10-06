/**
 * 指南那张表的视觉约定。
 *
 * 三米外看一堵字墙，是扫不动的。信息本身没问题——「几点、多少钱、适合几岁」
 * 都在，但它们长得一模一样，眼睛没有落点。
 *
 * 所以给每一类事实一个符号。符号不是装饰，是**让眼睛先找到类别再读值**：
 * 想知道多少钱的时候，先找那个图标，不用把四行字都读一遍。
 *
 * 模型写的 key 不固定（When / 时间 / Opening / 价位 / Suits / 适合…），
 * 所以按词义匹配，匹配不上就不给图标——宁可没有，也不要配错一个。
 */

const RULES = [
  // 「对你」要排在「适合」前面，而且不能共用一个图标。
  // 撞图标等于没分类：孩子合不合适、和她自己能不能喘口气，是两件事，
  // 而后者恰恰是这个产品唯一会替她盯着的那一类。
  [['for you', 'for her', 'yourself', '对你', '给你', '你自己'], '☕'],
  [['when', 'time', 'hour', 'open', '时间', '几点', '营业', '开门'], '🕐'],
  [['cost', 'price', 'fee', 'ticket', '价', '票', '费用', '多少钱'], '🏷️'],
  [['suit', 'age', 'who', '适合', '岁', '年龄'], '🧒'],
  [['travel', 'how', 'get', 'bus', 'car', 'walk', '怎么去', '交通', '多远'], '🚌'],
  [['where', 'place', 'address', 'area', '在哪', '地址', '位置'], '📍'],
  [['book', 'need', 'bring', 'note', '要带', '需要', '预约'], '📝'],
  [['vibe', 'what', 'like', '什么样', '感觉'], '✦'],
];

/** 这一类事实配哪个符号。认不出来就返回空——不配错比配上重要。 */
export function iconFor(key) {
  const k = String(key ?? '').toLowerCase();
  if (!k) return '';
  for (const [words, icon] of RULES) {
    if (words.some(w => k.includes(w))) return icon;
  }
  return '';
}

/**
 * 这张表值不值得分块显示。
 *
 * 一个方案的时候不用加框——框是用来分隔的，只有一个东西要分隔什么。
 */
export const needsCards = options => (options?.length ?? 0) > 1;

/** 这一行是不是关于她自己的。是的话用暖色——和整个产品里那类信息一致。 */
export const isHers = key =>
  ['for you', 'for her', 'yourself', '对你', '给你', '你自己']
    .some(w => String(key ?? '').toLowerCase().includes(w));
