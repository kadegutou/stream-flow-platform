import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    // antd 单包约 980KB（顶层组件无法再拆细），属预期，不再刷体积警告
    chunkSizeWarningLimit: 1000,
    /*
     * 依赖分包。注意这里必须用函数形式按「作用域」判定，不能写成
     * `{ flow: ['@xyflow/react'] }`：那种写法会把 @xyflow 引用的共享依赖
     * （zustand 等）一并卷进 flow 块，而入口也依赖这些共享依赖，
     * 结果 flow 块被首屏静态依赖——index.html 里出现 flow 的 modulepreload，
     * 画布库 184KB 在登录页就下载，懒加载优化被抵消。
     */
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const path = id.replace(/\\/g, '/');
          if (path.includes('/@xyflow/')) return 'flow';
          if (path.includes('/antd/') || path.includes('/@ant-design/') || path.includes('/rc-')) {
            return 'antd';
          }
          if (
            path.includes('/react/') ||
            path.includes('/react-dom/') ||
            path.includes('/react-router') ||
            path.includes('/scheduler/')
          ) {
            return 'react';
          }
          // 其余（zustand / axios / dayjs 等）不强制归组：硬塞进 vendor 会让
          // vendor 与 react/antd 互相引用形成循环 chunk，交给 Rollup 自动分配更稳
          return undefined;
        },
      },
    },
  },
  test: {
    // 纯逻辑单测（DAG 校验/布局/参数判断），不需要 DOM 环境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
