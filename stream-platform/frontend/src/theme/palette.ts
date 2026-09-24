/**
 * 全站配色的**唯一来源**。
 *
 * 用法：
 *   1. TS/TSX 里取语义 token —— `palette(dark).surface`；
 *   2. 需要透明度时用 `…Rgb` 三元组自组 —— `rgba(${p.accentRgb},.12)`；
 *   3. CSS 里用同名 CSS 变量 —— `var(--sp-surface)` / `rgba(var(--sp-accent-rgb),.12)`
 *      （变量由 `applyThemeVars()` 在启动与主题切换时写入 `:root`）。
 *
 * 约定：
 *   - 品牌色浅色档 `#2f54eb`、暗色档 `#5b8cff`；深蓝底渐变 `#141e30 → #243b55`（登录页/侧边栏）；
 *   - 退出/登出语义保留红色（浅色 `#8b2a2a→#c04545`，暗色 `#a03535→#d06060`）；
 *   - 分类色与状态色**同色相、不同明度**：分类用 500 档，状态用 600 档；
 *   - 首页（英雄页）有独立配色，见 `theme/home.ts`——暗色青绿是有意为之。
 *
 * 所有值都取自改造前的字面量，属"零视觉变化"重构；新增色值请同步标注对比度。
 */

export interface Palette {
  /** 页面底色 */
  page: string;
  /** 卡片/面板底色 */
  surface: string;
  /** 次级表面：表头、输入框、玻璃卡等 */
  surfaceAlt: string;
  /** 三级表面：暗色下的工具栏/面板 */
  surfaceMuted: string;
  /** 画布底色 */
  canvas: string;
  /** 图表底色 */
  chart: string;
  /** 图节点底色 */
  node: string;

  border: string;
  borderStrong: string;
  borderSubtle: string;
  borderHairline: string;

  text: string;
  textMuted: string;
  textSubtle: string;
  textDisabled: string;
  onBrand: string;
  /** 永远深色表面（登录页、转场幕布、侧边栏）上的正文/次级文字，两种模式同值 */
  textOnDeep: string;
  textOnDeepMuted: string;

  /** 品牌主色 */
  accent: string;
  /** 品牌种子色：两种模式都一样，用于 antd colorPrimary 种子与"永远深色"的侧边栏 */
  brandSeed: string;
  brandSeedLight: string;
  /** 品牌主色深一档（浅色底上的文字/描边强调） */
  accentStrong: string;
  /** 品牌主色浅一档（暗色底上的强调） */
  accentLight: string;
  /** 品牌渐变（按钮、品牌标记、页头图标底） */
  accentGradient: string;
  /** 深蓝品牌底（登录页背景、侧边栏） */
  brandDeepGradient: string;
  /** 同上，135° 斜向版（登录页背景用） */
  brandDeepGradientDiagonal: string;

  success: string;
  successStrong: string;
  warning: string;
  warningStrong: string;
  gold: string;
  goldStrong: string;
  danger: string;
  dangerStrong: string;
  neutral: string;
  neutralStrong: string;

  /** 退出/登出转场的红渐变 */
  logoutGradient: string;
  /** 登录开屏进度条的填充渐变（暗色多一档亮色过渡） */
  progressGradient: string;
  /** 退出转场日志文字（浅色模式用更深一档） */
  logoutText: string;
  logoutTextStrong: string;

  /** 列表行 hover 底色 */
  rowHover: string;
  /** 表格斑马纹底色 */
  stripeRow: string;
  /** 细滚动条滑块（常态 / 悬停） */
  scrollbarThumb: string;
  scrollbarThumbHover: string;

  /** 画布背景点阵 */
  canvasDot: string;
  /** 小地图遮罩 */
  minimapMask: string;

  /** 键盘焦点环 */
  focusRing: string;

  /**
   * RGB 三元组：给需要自定透明度的场合拼 `rgba(...)` 用，
   * 这样"色相"只有一处定义，透明度仍可按场景取。
   */
  accentRgb: string;
  accentLightRgb: string;
  brandSeedRgb: string;
  successRgb: string;
  warningRgb: string;
  dangerRgb: string;
  neutralRgb: string;
  /** 深色文字基色（#141e30 一族，用于浅色下的阴影/描边） */
  inkRgb: string;
  /** 暗色场景的正文字色基（#d5dbea 一族） */
  onDarkRgb: string;
  whiteRgb: string;
}

const LIGHT: Palette = {
  page: '#f3f5f9',
  surface: '#ffffff',
  surfaceAlt: '#fafbfd',
  surfaceMuted: '#f0f0f0',
  canvas: '#ffffff',
  chart: '#fafbfd',
  node: '#ffffff',

  border: '#e4e8f0',
  borderStrong: '#c9d2e3',
  borderSubtle: '#e8ebf2',
  borderHairline: 'rgba(20,30,48,.06)',

  text: '#1f2d3d',
  textMuted: '#5a6072',
  textSubtle: '#6b7280',
  textDisabled: '#cccccc',
  onBrand: '#ffffff',
  textOnDeep: '#e8ecf5',
  textOnDeepMuted: '#7d8899',

  accent: '#2f54eb',
  brandSeed: '#2f54eb',
  brandSeedLight: '#5b8cff',
  accentStrong: '#1f3db8',
  accentLight: '#5b8cff',
  accentGradient: 'linear-gradient(135deg, #2f54eb 0%, #5b8cff 100%)',
  brandDeepGradient: 'linear-gradient(180deg, #141e30 0%, #243b55 100%)',
  brandDeepGradientDiagonal: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)',

  // 分类色（500 档）与状态色（600 档）同色相、不同明度
  success: '#52c41a',
  successStrong: '#389e0d',
  warning: '#fa8c16',
  warningStrong: '#d46b08',
  gold: '#d48806',
  goldStrong: '#d48806',
  danger: '#ff4d4f',
  dangerStrong: '#cf1322',
  neutral: '#8c8c8c',
  neutralStrong: '#8c8c8c',

  logoutGradient: 'linear-gradient(180deg, #8b2a2a, #c04545)',
  progressGradient: 'linear-gradient(90deg, #2f54eb, #5b8cff)',
  // 浅色模式幕布下日志文字更深一档（深色模式用 #c04545，见 DARK）
  logoutText: '#a03535',
  logoutTextStrong: '#8b2a2a',

  rowHover: '#eef3ff',
  stripeRow: '#fafbfd',
  scrollbarThumb: '#c9d2e3',
  scrollbarThumbHover: '#a8b6d0',

  canvasDot: '#e8ebf2',
  minimapMask: 'rgba(243,245,249,.72)',

  focusRing: '#2f54eb',

  accentRgb: '47,84,235',
  accentLightRgb: '122,165,255',
  brandSeedRgb: '47,84,235',
  successRgb: '82,196,26',
  warningRgb: '250,140,22',
  dangerRgb: '255,77,79',
  neutralRgb: '140,140,140',
  inkRgb: '20,30,48',
  onDarkRgb: '213,219,234',
  whiteRgb: '255,255,255',
};

const DARK: Palette = {
  page: '#0f1420',
  surface: '#141b2b',
  surfaceAlt: '#1b2334',
  surfaceMuted: '#1b2334',
  canvas: '#0f1420',
  chart: '#161d2e',
  node: '#1b2334',

  border: '#2c3a55',
  borderStrong: '#3e4c69',
  borderSubtle: '#232c42',
  borderHairline: 'rgba(255,255,255,.06)',

  text: '#d5dbea',
  textMuted: '#9aa6bd',
  textSubtle: '#8b96ad',
  textDisabled: '#5c6478', // 暗色 #141b2b 上约 4.6:1（原 #444444 仅 2.3:1）
  onBrand: '#ffffff',
  textOnDeep: '#e8ecf5',
  textOnDeepMuted: '#7d8899',

  accent: '#5b8cff',
  brandSeed: '#2f54eb',
  brandSeedLight: '#5b8cff',
  accentStrong: '#7aa5ff',
  accentLight: '#7aa5ff',
  accentGradient: 'linear-gradient(135deg, #2f54eb 0%, #5b8cff 100%)',
  brandDeepGradient: 'linear-gradient(180deg, #141e30 0%, #243b55 100%)',
  brandDeepGradientDiagonal: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)',

  success: '#73d13d',
  successStrong: '#73d13d',
  warning: '#ffa940',
  warningStrong: '#ffa940',
  gold: '#ffc53d',
  goldStrong: '#ffc53d',
  danger: '#ff7875',
  dangerStrong: '#ff7875',
  neutral: '#bfbfbf',
  neutralStrong: '#bfbfbf',

  // 转场幕布两种模式共用同一条红渐变；只是日志文字在浅色下取更深一档
  logoutGradient: 'linear-gradient(180deg, #8b2a2a, #c04545)',
  progressGradient: 'linear-gradient(90deg, #2f54eb, #5b8cff, #7aa5ff)',
  logoutText: '#c04545',
  logoutTextStrong: '#d06060',

  rowHover: '#1d2942',
  stripeRow: '#161d2e',
  scrollbarThumb: '#2f3a52',
  scrollbarThumbHover: '#3e4c69',

  canvasDot: '#232c42',
  minimapMask: 'rgba(15,20,32,.72)',

  focusRing: '#5b8cff',

  accentRgb: '91,140,255',
  accentLightRgb: '122,165,255',
  brandSeedRgb: '47,84,235',
  successRgb: '115,209,61',
  warningRgb: '255,169,64',
  dangerRgb: '255,120,117',
  neutralRgb: '191,191,191',
  inkRgb: '20,30,48',
  onDarkRgb: '213,219,234',
  whiteRgb: '255,255,255',
};

export function palette(dark: boolean): Palette {
  return dark ? DARK : LIGHT;
}

/**
 * 与主题无关的固定色：同一取值在明暗两套下都用（刻意的设计，不是遗漏）。
 * 集中在这里，免得散落在组件里以后没人敢改。
 */
export const FIXED = {
  /** 画布节点「必填已配齐 / 待配置」角标 */
  okBadge: '#52c41a',
  warnBadge: '#fa8c16',
  /** 拖拽删除的警示红 */
  trashDanger: '#ff4d4f',
  /** 控件面板条目底色（浅色模式下的浅灰，比卡片白略深一点） */
  paletteItemBg: '#fafafa',
  /** 监控指标卡渐变：统一到品牌蓝色阶，恒定深色底不随明暗切换 */
  metricSuccessGradient: 'linear-gradient(135deg, #134e4a 0%, #0d9488 100%)',
  metricWarnGradient: 'linear-gradient(135deg, #1e3a5f 0%, #3b82f6 100%)',
  /** 登录/退出转场里斜切条的品牌蓝渐变 */
  accentBarGradient: 'linear-gradient(180deg, #2f54eb, #5b8cff)',
} as const;

/** CSS 变量名 → palette 字段。`applyThemeVars()` 与 global.css 的 var() 引用共用这张表。 */
const CSS_VAR_KEYS: Array<[keyof Palette, string]> = [
  ['page', '--sp-page'],
  ['surface', '--sp-surface'],
  ['surfaceAlt', '--sp-surface-alt'],
  ['surfaceMuted', '--sp-surface-muted'],
  ['canvas', '--sp-canvas'],
  ['chart', '--sp-chart'],
  ['node', '--sp-node'],
  ['border', '--sp-border'],
  ['borderStrong', '--sp-border-strong'],
  ['borderSubtle', '--sp-border-subtle'],
  ['borderHairline', '--sp-border-hairline'],
  ['text', '--sp-text'],
  ['textMuted', '--sp-text-muted'],
  ['textSubtle', '--sp-text-subtle'],
  ['textDisabled', '--sp-text-disabled'],
  ['onBrand', '--sp-on-brand'],
  ['textOnDeep', '--sp-text-on-deep'],
  ['textOnDeepMuted', '--sp-text-on-deep-muted'],
  ['accent', '--sp-accent'],
  ['brandSeed', '--sp-brand-seed'],
  ['brandSeedLight', '--sp-brand-seed-light'],
  ['accentStrong', '--sp-accent-strong'],
  ['accentLight', '--sp-accent-light'],
  ['accentGradient', '--sp-accent-gradient'],
  ['brandDeepGradient', '--sp-brand-deep'],
  ['brandDeepGradientDiagonal', '--sp-brand-deep-diagonal'],
  ['success', '--sp-success'],
  ['successStrong', '--sp-success-strong'],
  ['warning', '--sp-warning'],
  ['warningStrong', '--sp-warning-strong'],
  ['gold', '--sp-gold'],
  ['goldStrong', '--sp-gold-strong'],
  ['danger', '--sp-danger'],
  ['dangerStrong', '--sp-danger-strong'],
  ['neutral', '--sp-neutral'],
  ['neutralStrong', '--sp-neutral-strong'],
  ['logoutGradient', '--sp-logout-gradient'],
  ['progressGradient', '--sp-progress-gradient'],
  ['logoutText', '--sp-logout-text'],
  ['logoutTextStrong', '--sp-logout-text-strong'],
  ['rowHover', '--sp-row-hover'],
  ['stripeRow', '--sp-stripe-row'],
  ['scrollbarThumb', '--sp-scrollbar-thumb'],
  ['scrollbarThumbHover', '--sp-scrollbar-thumb-hover'],
  ['canvasDot', '--sp-canvas-dot'],
  ['minimapMask', '--sp-minimap-mask'],
  ['focusRing', '--sp-focus-ring'],
  ['accentRgb', '--sp-accent-rgb'],
  ['accentLightRgb', '--sp-accent-light-rgb'],
  ['brandSeedRgb', '--sp-brand-seed-rgb'],
  ['successRgb', '--sp-success-rgb'],
  ['warningRgb', '--sp-warning-rgb'],
  ['dangerRgb', '--sp-danger-rgb'],
  ['neutralRgb', '--sp-neutral-rgb'],
  ['inkRgb', '--sp-ink-rgb'],
  ['onDarkRgb', '--sp-on-dark-rgb'],
  ['whiteRgb', '--sp-white-rgb'],
];

/** 固定色同样写一份 CSS 变量（值不随主题变化） */
const FIXED_CSS_VAR_KEYS: Array<[keyof typeof FIXED, string]> = [
  ['accentBarGradient', '--sp-accent-bar-gradient'],
];

/**
 * 把当前主题的色值写进 `:root` 的 CSS 变量。
 * 在 main.tsx 启动时调用一次（避免首屏闪色），主题切换时再调用一次。
 */
export function applyThemeVars(dark: boolean): void {
  const p = palette(dark);
  const root = document.documentElement;
  for (const [key, cssVar] of CSS_VAR_KEYS) {
    root.style.setProperty(cssVar, p[key]);
  }
  for (const [key, cssVar] of FIXED_CSS_VAR_KEYS) {
    root.style.setProperty(cssVar, FIXED[key]);
  }
}
