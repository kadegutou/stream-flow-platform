import { create } from 'zustand';

/** 全局明暗主题（localStorage 持久化） */
const KEY = 'sp-theme-dark';

export const useThemeStore = create<{ dark: boolean; toggle: () => void }>((set) => ({
  dark: localStorage.getItem(KEY) === '1',
  toggle: () =>
    set((s) => {
      const dark = !s.dark;
      localStorage.setItem(KEY, dark ? '1' : '0');
      return { dark };
    }),
}));

/** 全局字体缩放（localStorage 持久化） */
const FONT_KEY = 'sp-font-scale';
export const MIN_FONT_SCALE = 0.85;
export const MAX_FONT_SCALE = 1.3;
const STEP = 0.05;

/**
 * 字号缩放实现：antd 组件尺寸全是 px，改 root font-size 无效，所以用 `zoom` 缩放整页
 * （Chrome / Edge 支持良好，也是答辩演示环境）。
 *
 * 注意 zoom 会把 vh 一起放大，因此同时把系数写进 CSS 变量 --sp-zoom，
 * 布局高度用 --sp-viewport-h 抵消（见 global.css 顶部说明）。
 */
export function applyFontScale(scale: number) {
  document.documentElement.style.setProperty('--sp-zoom', String(scale));
  document.body.style.zoom = String(scale);
}

function readSavedScale(): number {
  const saved = Number.parseFloat(localStorage.getItem(FONT_KEY) ?? '1');
  return Number.isFinite(saved) ? saved : 1;
}

/** 启动时恢复上次的字号缩放。放在 main.tsx 显式调用，避免「import 即产生 DOM 副作用」。 */
export function initFontScale() {
  applyFontScale(readSavedScale());
}

export const useFontScaleStore = create<{
  scale: number;
  increase: () => void;
  decrease: () => void;
}>((set) => ({
  scale: readSavedScale(),
  increase: () =>
    set((s) => {
      const scale = Math.min(MAX_FONT_SCALE, +(s.scale + STEP).toFixed(2));
      localStorage.setItem(FONT_KEY, String(scale));
      applyFontScale(scale);
      return { scale };
    }),
  decrease: () =>
    set((s) => {
      const scale = Math.max(MIN_FONT_SCALE, +(s.scale - STEP).toFixed(2));
      localStorage.setItem(FONT_KEY, String(scale));
      applyFontScale(scale);
      return { scale };
    }),
}));
