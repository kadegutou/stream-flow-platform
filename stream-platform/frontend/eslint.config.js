import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * ESLint 扁平配置。
 * 规则集：JS 推荐 + TypeScript 推荐 + React Hooks 推荐（含 hooks 依赖数组校验）。
 * 说明：hooks 依赖校验是本项目最需要的一条——画布/轮询/转场里有大量 useEffect，
 * 漏依赖或多余依赖都会直接变成「状态不对」的线上问题。
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '*.tsbuildinfo'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // 本项目大量页面就是「挂载后拉一次数据」这种标准写法，该规则针对的是
      // 派生状态引起的级联渲染，这里降为警告以免噪音掩盖真正的 hooks 依赖问题。
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
);
