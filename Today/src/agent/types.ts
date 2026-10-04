/**
 * Today 不是一个会生成清单的接口，是一个会开口的角色。
 *
 * 所以数据模型的中心是「Today 的一次开口」（Turn），不是「今天的任务列表」。
 * 一次开口 = 它说的一句话 + 零到多张卡片。
 * 能打勾的事、它先收着的事、它记住的事，各是一种卡片——
 * 不把结构化的东西塞进对话气泡里让人去读。
 *
 * 以后加新能力就是加一种卡片类型，对话层不动。
 */

export type Task = {
  id: string;
  /** 短句，电视上一行放得下。 */
  label: string;
  /** 时间锚点。用「送完学回来」而不是「9:30」——妈妈的一天不按钟表走。 */
  note?: string;
  /** 这件是给她自己的。整个产品里唯一需要被保护的字段。 */
  forHer?: boolean;
  done: boolean;
};

export type Card =
  /** 今天的事。可聚焦、可打勾。 */
  | {type: 'tasks'; items: Task[]}
  /** Today 先替她收着的。列出来让人放心，但不能操作——今天不用管。 */
  | {type: 'later'; items: string[]}
  /** Today 记住的。可以被她纠正，所以每条带 id。 */
  | {type: 'memory'; items: {id: string; text: string}[]};

/** Today 的一次开口。 */
export type Turn = {
  /** 第一人称，它自己说的话。 */
  say: string;
  cards: Card[];
};

/**
 * Today 记住的东西。
 *
 * 「我都记着呢」这句话必须是真的——它今天说记得、明天忘光，
 * 比不说更伤人。所以记忆是这个角色的前提，不是功能。
 */
export type Memory = {
  /** 她生活里的人。Bits 是谁，奶奶是谁。 */
  people: {name: string; who: string}[];
  /** 反复出现的节奏。周三要交表格，周二是垃圾日。 */
  rhythms: string[];
  /** 她一直往后推的事。不是用来追责，是用来判断什么该放下。 */
  carrying: string[];
  /** 她为自己做的事。记下来，下次好替她留位置。 */
  hers: string[];
  /** 别的值得留着的。 */
  notes: string[];
  updatedAt: string;
};

export const EMPTY_MEMORY: Memory = {
  people: [],
  rhythms: [],
  carrying: [],
  hers: [],
  notes: [],
  updatedAt: '',
};

export type PlanRequest = {
  /** 她说的话。可能是一段语音转写，乱的、重复的、带情绪的。 */
  braindump: string;
  now: string;
  /** Today 已经记住的东西，作为上下文喂回去。 */
  memory?: Memory;
  /** 昨天没做完的。用来判断什么该放下，不是用来追责。 */
  carryOver?: string[];
  lang?: 'zh' | 'en';
};
