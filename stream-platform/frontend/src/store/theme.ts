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
