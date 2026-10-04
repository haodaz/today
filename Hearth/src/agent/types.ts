/** 一天的计划。agent 的全部输出。 */
export type Plan = {
  /** 一句话。随时段和当天实际内容变，不是模板。 */
  greeting: string;
  /** 今天真正要做的。最多三件。 */
  focus: Task[];
  /** 今天不做的。明确说出来，比默默堆着让人安心。 */
  later: string[];
};

export type Task = {
  id: string;
  /** 短句，电视上一行放得下。 */
  label: string;
  /** 时间锚点。用「送完学回来」而不是「9:30」——妈妈的一天不按钟表走。 */
  note?: string;
  anchor?: 'morning' | 'midday' | 'afternoon' | 'evening';
  /** 这件是给她自己的。整个产品里唯一需要被保护的字段。 */
  forHer?: boolean;
  done: boolean;
};

export type PlanRequest = {
  /** 她说的话。可能是一段语音转写，乱的、重复的、带情绪的。 */
  braindump: string;
  /** 现在几点。agent 要据此判断还剩多少时间，别排不可能的量。 */
  now: string;
  /** 昨天没做完的。用来判断什么该放下，不是用来追责。 */
  carryOver?: string[];
  lang?: 'zh' | 'en';
};
