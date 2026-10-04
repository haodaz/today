/**
 * Today 视觉系统
 *
 * 两条约束决定了这套配色：
 * 1) 这块屏幕全天开着。固定一块高亮浅色面板从早亮到晚，既刺眼也费电。
 * 2) 它应该像家里的光，而不是像一个软件。
 *
 * 所以背景随时间走：清晨偏冷、白天中性、傍晚转暖、入夜自动沉下来。
 * 这不是「深色模式」那种开关，是一天的光线变化。
 */

export type Daypart = 'dawn' | 'day' | 'dusk' | 'night';

export function daypartOf(d: Date): Daypart {
  const h = d.getHours();
  if (h >= 5 && h < 9) return 'dawn';
  if (h >= 9 && h < 16) return 'day';
  if (h >= 16 && h < 20) return 'dusk';
  return 'night';
}

type Palette = {
  bg: string;
  surface: string;
  surfaceFocused: string;
  border: string;
  text: string;
  textSoft: string;
  textFaint: string;
  accent: string;
  accentSoft: string;
  done: string;
};

/** 主色：一点暖。全系统只有这一个彩色——其余都是中性灰。 */
const EMBER = '#C2703D';

export const palettes: Record<Daypart, Palette> = {
  dawn: {
    bg: '#F6F7F9',
    surface: '#FFFFFF',
    surfaceFocused: '#FFFFFF',
    border: '#E6E8EC',
    text: '#1F2328',
    textSoft: '#5B636E',
    textFaint: '#99A0AA',
    accent: EMBER,
    accentSoft: '#F6E8DF',
    done: '#8A9199',
  },
  day: {
    bg: '#F5F5F4',
    surface: '#FFFFFF',
    surfaceFocused: '#FFFFFF',
    border: '#E4E4E2',
    text: '#1C1D1C',
    textSoft: '#57595A',
    textFaint: '#95989A',
    accent: EMBER,
    accentSoft: '#F7E9E0',
    done: '#8C8F90',
  },
  dusk: {
    bg: '#F4EFE8',
    surface: '#FBF8F4',
    surfaceFocused: '#FFFDFA',
    border: '#E6DED3',
    text: '#241F1A',
    textSoft: '#5E554B',
    textFaint: '#9A9087',
    accent: EMBER,
    accentSoft: '#F0E0D2',
    done: '#8F867C',
  },
  night: {
    // 入夜后整块屏沉下来：不刺眼、不招人看、也不会在客厅里当第二个灯泡
    bg: '#17161A',
    surface: '#1F1E23',
    surfaceFocused: '#272529',
    border: '#2E2C32',
    text: '#EDEAE6',
    textSoft: '#A7A29C',
    textFaint: '#6E6A66',
    accent: '#D98B5A',
    accentSoft: '#3A2A20',
    done: '#6E6A66',
  },
};

/**
 * 10-foot UI 字号梯度。
 * 电视的观看距离是手机的 8–10 倍，手机上的 16px 在沙发上约等于看不见。
 * 最小字号 20，正文 34。
 */
export const type = {
  clock: 104,
  greeting: 44,
  task: 34,
  section: 22,
  meta: 20,
};

/** 电视会裁边（overscan）。所有内容收在 5% 安全区内。 */
export const safe = { h: 72, v: 56 };

export const space = { xs: 8, sm: 14, md: 22, lg: 36, xl: 56 };
