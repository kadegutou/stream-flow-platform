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
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.3;
const STEP = 0.05;

function applyFontScale(scale: number) {
  // 用 zoom 缩放整个页面（antd 组件用 px，改 fontSize 无效）
  document.body.style.zoom = String(scale);
}

// 初始化时恢复
const savedScale = parseFloat(localStorage.getItem(FONT_KEY) || '1');
applyFontScale(savedScale);

export const useFontScaleStore = create<{
  scale: number;
  increase: () => void;
  decrease: () => void;
}>((set) => ({
  scale: savedScale,
  increase: () =>
    set((s) => {
      const scale = Math.min(MAX_SCALE, +(s.scale + STEP).toFixed(2));
      localStorage.setItem(FONT_KEY, String(scale));
      applyFontScale(scale);
      return { scale };
    }),
  decrease: () =>
    set((s) => {
      const scale = Math.max(MIN_SCALE, +(s.scale - STEP).toFixed(2));
      localStorage.setItem(FONT_KEY, String(scale));
      applyFontScale(scale);
      return { scale };
    }),
}));
