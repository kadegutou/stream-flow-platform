import { defineConfig } from 'vite';
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
    // antd 单包约 930KB，属预期（已按依赖分 chunk），不再刷体积警告
    chunkSizeWarningLimit: 1000,
    // 拆分大依赖：画布库（@xyflow/react）只在作业编辑器用，
    // 配合路由懒加载后首屏不再下载它
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          antd: ['antd', '@ant-design/icons'],
          flow: ['@xyflow/react'],
        },
      },
    },
  },
});
