import {getLocales} from 'expo-localization';

export type Lang = 'zh' | 'en';

/**
 * 这个产品有两类读者：
 * 用它的妈妈（中文），和评审它的人（英文）。
 * 两边都得是第一等公民——英文不能是机翻的影子。
 */
const DICT = {
  zh: {
    today: '今天',
    leftN: (n: number) => `还剩 ${n} 件`,
    allDone: '都做完了',
    notToday: '今天不做',
    remoteHint: '按遥控器上下选，中间键打勾',
    empty: '今天还没理。',
    scanHint: '手机扫一下，说说今天',
    weekdays: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'],
    date: (m: number, d: number, w: string) => `${m} 月 ${d} 日 · ${w}`,
  },
  en: {
    today: 'TODAY',
    leftN: (n: number) => (n === 1 ? '1 left' : `${n} left`),
    allDone: 'All done',
    notToday: 'Not today',
    remoteHint: 'Up and down to move, centre to check off',
    empty: "Today isn't sorted yet.",
    scanHint: 'Scan with your phone and tell it about today',
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    date: (m: number, d: number, w: string) =>
      `${['January','February','March','April','May','June','July','August','September','October','November','December'][m - 1]} ${d} · ${w}`,
  },
} as const;

/**
 * 跟随设备语言。
 * 录 demo 视频时要强制英文（Amazon 规定视频必须英文），
 * 把 OVERRIDE 改成 'en' 即可——比去系统设置里改语言快，也不影响她平时用。
 */
const OVERRIDE: Lang | null = null;

export function detectLang(): Lang {
  if (OVERRIDE) return OVERRIDE;
  try {
    const tag = getLocales()[0]?.languageCode ?? 'en';
    return tag.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export function t(lang: Lang) {
  return DICT[lang];
}

/** 时钟。中文用 12 小时不带 AM/PM，英文同样——电视上那个大字不需要后缀。 */
export function clockOf(d: Date) {
  const h = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  return `${h}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function dateLineOf(d: Date, lang: Lang) {
  const x = t(lang);
  return x.date(d.getMonth() + 1, d.getDate(), x.weekdays[d.getDay()]);
}
