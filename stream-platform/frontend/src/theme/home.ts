/**
 * 首页（英雄页）配色。
 *
 * 暗色 = 青绿系：`#2ee8a0` 一脉，深色底上"数据流动"的气质，已确认保留。
 * 浅色 = 品牌蓝系：`#2f54eb` 一脉，替换原先的紫色 `#7c3aed`
 *        —— 全站品牌色是蓝（侧边栏/按钮/转场/监控卡），首页紫会像另一个产品。
 *
 * 每个值都按 WCAG 算过对比度，写在注释里，改动时请同步复核：
 * 小字要 ≥4.5:1，图形/描边要 ≥3:1。
 */
export interface HomePalette {
  pageBg: string;
  /** 页面底部的径向光晕 */
  glow: string;
  textPrimary: string;
  textSecondary: string;
  /** 强调色：图标、按钮强调 */
  accent: string;
  /** 日志文本：比 accent 深/淡一档，保证 12px 文本的对比度 */
  logText: string;
  particle: string;
  cardBg: string;
  cardBorder: string;
  cardHoverBorder: string;
  cardHoverShadow: string;
  graph: {
    /** 节点描边 / 连线端点 */
    node: string;
    nodeFill: string;
    /** 淡化状态下的节点填充 */
    dimFill: string;
    dimmed: string;
    line: string;
    lineHighlight: string;
    dot: string;
    tip: string;
  };
}

const DARK: HomePalette = {
  pageBg: '#050a10',
  glow: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(62,207,192,.08), transparent)',
  textPrimary: '#f4faf8',
  textSecondary: '#6ab8ac',
  accent: '#3ecfc0',
  logText: '#5ac898',
  particle: 'rgba(46,232,160,.1)',
  cardBg: '#0d1822',
  cardBorder: 'rgba(62,207,192,.22)',
  cardHoverBorder: 'rgba(62,207,192,.55)',
  cardHoverShadow: '0 4px 20px rgba(46,232,160,.15)',
  graph: {
    node: '#2ee8a0',
    nodeFill: '#0a1e14',
    dimFill: '#111822',
    dimmed: 'rgba(46,232,160,.05)',
    line: 'rgba(46,232,160,.28)',
    lineHighlight: 'rgba(46,232,160,.85)',
    dot: '#4ef0b8',
    tip: '#5ac898',
  },
};

const LIGHT: HomePalette = {
  pageBg: '#dde3ec',
  glow: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(47,84,235,.06), transparent)',
  textPrimary: '#1a2332',
  // #4a5570：白底 5.76:1、页面底 7.43:1（原紫色 #6a4a9e 为 5.27/6.8，但紫与品牌色冲突）
  textSecondary: '#4a5570',
  // 品牌主色 #2f54eb：页面底 4.53:1、白底 5.85:1
  accent: '#2f54eb',
  // 文本用的深一档 #2b4bd8：页面底 5.25:1，给投影留余量
  logText: '#2b4bd8',
  particle: 'rgba(47,84,235,.07)',
  cardBg: '#ffffff',
  cardBorder: 'rgba(47,84,235,.16)',
  cardHoverBorder: 'rgba(47,84,235,.45)',
  cardHoverShadow: '0 4px 20px rgba(47,84,235,.12)',
  graph: {
    node: '#2f54eb',
    nodeFill: '#e6ecff',
    dimFill: '#f0f1f5',
    dimmed: 'rgba(47,84,235,.03)',
    line: 'rgba(47,84,235,.22)',
    lineHighlight: 'rgba(47,84,235,.65)',
    dot: '#2f54eb',
    tip: '#4a5570',
  },
};

export function homePalette(dark: boolean): HomePalette {
  return dark ? DARK : LIGHT;
}
