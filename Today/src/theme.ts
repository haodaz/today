/**
 * Today 视觉系统
 *
 * 三条约束决定了这套配色：
 *
 * 1) 这块屏幕全天开着。暖橙暖棕一直在推你，看一天是累的；
 *    极光色的浅蓝浅紫是退后的，不抢。
 * 2) 老虎是橙色的。放在冷色上它成了画面里唯一的暖源，自己就跳出来，
 *    不用给它加任何强调。
 * 3) 背景随时间走——清晨偏蓝，白天最淡，傍晚转紫，入夜整块沉下来。
 *    这不是「深色模式」那种开关，是一天的光线变化。
 */

export type Daypart = 'dawn' | 'day' | 'dusk' | 'night';

export function daypartOf(d: Date): Daypart {
  const h = d.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 20) return 'dusk';
  return 'night';
}

/**
 * 窗景挑哪一张：时辰 × 天气。
 *
 * 天气只分四档，因为窗外只需要四种样子——毛毛雨和雷雨在一扇窗里看着都是雨，
 * 雾和阴天都是灰。拿不到天气就当阴天：不说谎，也不抢眼。
 */
export type Sky = 'clear' | 'cloud' | 'rain' | 'snow';

export function skyOf(kind?: string): Sky {
  if (kind === 'clear') return 'clear';
  if (kind === 'snow') return 'snow';
  if (kind === 'rain' || kind === 'drizzle' || kind === 'storm') return 'rain';
  return 'cloud';
}

export const sceneOf = (d: Daypart, kind?: string) => `${d}-${skyOf(kind)}`;

type Palette = {
  /** 极光渐变的三个停点，从上到下 */
  sky: [string, string, string];
  surface: string;
  surfaceFocused: string;
  border: string;
  text: string;
  textSoft: string;
  textFaint: string;
  /** 交互主色：聚焦、勾选、按钮 */
  accent: string;
  /** 「给她自己的」用暖色标，和老虎同源，在冷色系里一眼认得出 */
  warm: string;
  done: string;
  shadow: string;
  /**
   * 窗景上那层「墙色」。从左往右四个停点：左栏的字落在最浓的那段上，
   * 右边渐淡，窗露出来。颜色取自同一时辰的画，所以看着像墙本身，不像蒙了块布。
   */
  veil: [string, string, string, string];
  /** 详情页那层：按进去之后整屏都是字，窗只留一点影子，但还是同一扇窗。 */
  veilDense: string;
};

const VIOLET = '#6B5CE7';
const VIOLET_SOFT = '#8C7FF0';
/** 杏色。只用在「这件是给你自己的」，全系统唯一的暖色标记。 */
const APRICOT = '#E89B5B';

/*
 * 次要文字的颜色是算出来的，不是挑的。
 * 原来的「淡」字在浅底上只有 2.64:1——网页的及格线是 4.5:1，
 * 而这块屏是隔着三米看的。现在浅色 4.63:1、夜里 5.47:1，层级还在，只是读得见了。
 */
export const palettes: Record<Daypart, Palette> = {
  dawn: {
    sky: ['#EAF0FD', '#F0EFFB', '#F7F7FB'],
    surface: 'rgba(255,255,255,0.82)',
    surfaceFocused: 'rgba(255,255,255,0.96)',
    border: 'rgba(107,92,231,0.14)',
    text: '#1E1B2E',
    textSoft: '#4A4560',
    textFaint: '#6E6984',
    accent: VIOLET,
    warm: APRICOT,
    done: '#9A95AD',
    shadow: 'rgba(107,92,231,0.16)',
    veil: ['rgba(240,238,250,0.90)', 'rgba(240,238,250,0.80)', 'rgba(240,238,250,0.30)', 'rgba(240,238,250,0.06)'],
    veilDense: 'rgba(240,238,250,0.90)',
  },
  day: {
    sky: ['#EFF3FD', '#F4F2FC', '#F8F8FC'],
    surface: 'rgba(255,255,255,0.84)',
    surfaceFocused: 'rgba(255,255,255,0.97)',
    border: 'rgba(107,92,231,0.13)',
    text: '#1C1A2A',
    textSoft: '#4A4560',
    textFaint: '#6E6984',
    accent: VIOLET,
    warm: APRICOT,
    done: '#9793A6',
    shadow: 'rgba(107,92,231,0.14)',
    veil: ['rgba(246,245,250,0.90)', 'rgba(246,245,250,0.80)', 'rgba(246,245,250,0.30)', 'rgba(246,245,250,0.06)'],
    veilDense: 'rgba(246,245,250,0.90)',
  },
  dusk: {
    sky: ['#EDE9FA', '#F1ECF8', '#F6F2F6'],
    surface: 'rgba(255,255,255,0.80)',
    surfaceFocused: 'rgba(255,255,255,0.95)',
    border: 'rgba(107,92,231,0.15)',
    text: '#231D33',
    textSoft: '#4A4560',
    textFaint: '#6E6984',
    accent: VIOLET_SOFT,
    warm: APRICOT,
    done: '#9B93AC',
    shadow: 'rgba(107,92,231,0.18)',
    veil: ['rgba(242,235,244,0.90)', 'rgba(242,235,244,0.80)', 'rgba(242,235,244,0.32)', 'rgba(242,235,244,0.08)'],
    veilDense: 'rgba(242,235,244,0.90)',
  },
  night: {
    // 入夜整块沉下来：不刺眼、不招人看，也不会在客厅里当第二个灯泡
    sky: ['#14131E', '#171623', '#131220'],
    // 原来是 5.5% 的白——那时背后是一块纯黑。现在背后是一扇亮着灯的窗，
    // 卡片要自己挡得住，字才不会压在楼上。
    surface: 'rgba(26,25,38,0.82)',
    surfaceFocused: 'rgba(40,38,58,0.92)',
    border: 'rgba(160,148,255,0.16)',
    text: '#E9E6F2',
    textSoft: '#B9B4CC',
    textFaint: '#8F8AA6',
    accent: '#A094FF',
    warm: '#E0A472',
    done: '#6F6A85',
    shadow: 'rgba(0,0,0,0.5)',
    veil: ['rgba(18,17,28,0.88)', 'rgba(18,17,28,0.76)', 'rgba(18,17,28,0.34)', 'rgba(18,17,28,0.12)'],
    veilDense: 'rgba(18,17,28,0.90)',
  },
};

/**
 * 10-foot UI 字号梯度。
 *
 * 关键的一个数：这台 Fire TV 是 4K 面板，density 320（×2），
 * 渲染分辨率 1920×1080 —— 所以竖向可用只有 540 dp，
 * 去掉上下安全区后只剩 428 dp。
 *
 * 一开始我按「1080 像素」定的字号（时钟 92、正文 34），
 * 算下来右栏要七百多 dp，塞进 428 dp 里怎么调边距都溢出。
 * 下面这套是按 428 dp 倒推的：
 *   标题 16 + 三张卡 3×64 + 记忆块 56 ≈ 264 dp，留足余量。
 *
 * 电视的观看距离是手机的 8–10 倍，所以即使 dp 数不大，
 * 物理尺寸仍然是手机的两倍——正文 20 dp 在 50 吋屏上约 1.3 cm 高。
 */
export const type = {
  clock: 56,
  greeting: 26,
  task: 20,
  section: 13,
  meta: 12,
};

/** 电视会裁边（overscan）。所有内容收在 5% 安全区内。 */
export const safe = {h: 44, v: 30};

export const space = {xs: 5, sm: 8, md: 13, lg: 20, xl: 30};
