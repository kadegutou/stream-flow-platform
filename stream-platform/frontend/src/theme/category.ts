import type { ComponentCategory } from '../types';
import { palette } from './palette';

/**
 * 控件分类（输入/处理/输出）的语义色与底色。
 *
 * 单独成模块而不是塞在 CategoryTag.tsx 里：调色板是「数据」，组件是「视图」，
 * 画布、小地图、控件面板都要用同一套色值。色值本身来自 `theme/palette.ts`：
 * 分类用 500 档、状态用 600 档（同色相、不同明度），避免"这个绿是输入还是运行中"的歧义。
 */
const CATEGORY_TONE: Record<ComponentCategory, 'success' | 'accent' | 'warning'> = {
  SOURCE: 'success',
  PROCESS: 'accent',
  SINK: 'warning',
};

/**
 * 分类底色（画布节点左侧色条）：浅色用淡彩，暗色用同色系深调。
 * 原先画布在暗色下也用浅色淡彩（#f6ffed 等），深色节点上会出现一条近乎发白的竖条。
 */
const CATEGORY_BG: Record<ComponentCategory, { light: string; dark: string }> = {
  SOURCE: { light: '#f6ffed', dark: '#16301c' },
  PROCESS: { light: '#f0f5ff', dark: '#122a3a' },
  SINK: { light: '#fff7e6', dark: '#3a2a12' },
};

export const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  SOURCE: '输入',
  PROCESS: '处理',
  SINK: '输出',
};

/**
 * 取分类语义色。暗色模式自动换用亮一档的变体：
 * 浅色 PROCESS #2f54eb 放在暗色节点上只有 2.68:1，暗色变体 #5b8cff 是 4.97:1。
 */
export function categoryColor(category: ComponentCategory, dark: boolean): string {
  return palette(dark)[CATEGORY_TONE[category]];
}

/** 取分类底色（画布节点色条） */
export function categoryBg(category: ComponentCategory, dark: boolean): string {
  const pair = CATEGORY_BG[category];
  return dark ? pair.dark : pair.light;
}
