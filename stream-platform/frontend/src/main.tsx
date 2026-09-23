import React from 'react';
import ReactDOM from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import App from './App';
import './global.css';
import { initFontScale, useThemeStore } from './store/theme';
import { applyThemeVars } from './theme/palette';

dayjs.locale('zh-cn');
// 恢复上次的字号缩放（副作用显式化，不再放在 store 模块顶层）
initFontScale();
// 首屏就把调色板写进 CSS 变量，避免"先按默认色渲染再被 JS 改色"的闪色
applyThemeVars(useThemeStore.getState().dark);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
