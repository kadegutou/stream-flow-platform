import type { ComponentCategory } from '../types';

/**
 * 控件分类（输入/处理/输出）的语义色与底色。
 *
 * 单独成模块而不是塞在 CategoryTag.tsx 里：调色板是「数据」，组件是「视图」，
 * 画布、小地图、控件面板都要用同一套色值，放这里避免组件文件同时导出常量与组件
 * （也会让 Fast Refresh 失效）。
 */
const CATEGORY_HEX: Record<ComponentCategory, string> = {
  SOURCE: '#52c41a',
  PROCESS: '#2f54eb',
  SINK: '#fa8c16',
};

/** 暗色模式下用亮一档，避免深色底上对比度不足 */
const CATEGORY_HEX_DARK: Record<ComponentCategory, string> = {
  SOURCE: '#73d13d',
  PROCESS: '#5b8cff',
  SINK: '#ffa940',
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
  return (dark ? CATEGORY_HEX_DARK : CATEGORY_HEX)[category];
}

/** 取分类底色（画布节点色条） */
export function categoryBg(category: ComponentCategory, dark: boolean): string {
  const pair = CATEGORY_BG[category];
  return dark ? pair.dark : pair.light;
}
