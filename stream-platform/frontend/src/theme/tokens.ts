/**
 * 设计 Token：间距、字号、圆角、阴影、动效时长的统一刻度。
 * 只抽数值，不抽颜色（颜色在 palette.ts / home.ts）。
 *
 * 使用原则：
 * - 新代码优先引用 token，不写魔法数字
 * - 旧代码如果值和刻度对不上（比如 padding: 18px），保留原值不强行凑
 */

/** 间距刻度（4px 基数） */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** 字号刻度 */
export const FONT_SIZE = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  title: 28,
} as const;

/** 圆角 */
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 10,
  xl: 16,
} as const;

/** 阴影（用 CSS 变量，随主题切换） */
export const SHADOW = {
  card: 'var(--sp-shadow-card)',
  hover: 'var(--sp-shadow-hover)',
} as const;

/** 动效时长（ms） */
export const DURATION = {
  fast: 150,
  normal: 250,
  slow: 400,
} as const;
