import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Component, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';
import { RouteTransitionProvider } from './components/RouteTransition';

// 路由级懒加载：登录页与整体框架先加载，业务页面按需拉取（首屏更小更快）
const Home = lazy(() => import('./pages/Home'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobEditor = lazy(() => import('./pages/JobEditor'));
const Components = lazy(() => import('./pages/Components'));
const Users = lazy(() => import('./pages/Users'));
const Monitor = lazy(() => import('./pages/Monitor'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const role = useAuthStore((s) => s.role);
  if (role !== 'ADMIN') return <Navigate to="/jobs" replace />;
  return children;
}

/** 临时排障：渲染崩溃时把错误显示在页面上而不是黑屏 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 24, color: 'red', whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {String(this.state.error)}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const dark = useThemeStore((s) => s.dark);
  useEffect(() => {
    document.documentElement.setAttribute('data-sp-dark', String(dark));
  }, [dark]);
  return (
    <ErrorBoundary>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#2f54eb',
          borderRadius: 8,
          colorBgLayout: dark ? '#0f1420' : '#f3f5f9',
          // 统一字体栈：避免不同机器（Windows/Mac/答辩现场）字体跳变
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", ' +
            '"Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
        },
        components: {
          Table: {
            headerBg: dark ? '#1b2334' : '#fafbfd',
            headerColor: dark ? '#9aa6bd' : '#5a6072',
            rowHoverBg: dark ? '#1d2942' : '#eef3ff',
          },
          Card: { paddingLG: 20 },
          // 侧边栏背景由 AppLayout 以渐变自定义，Menu 透明以透出底色
          Menu: {
            darkItemBg: 'transparent',
            darkSubMenuItemBg: 'transparent',
            darkItemSelectedBg: 'rgba(47,84,235,.95)',
            darkItemHoverBg: 'rgba(255,255,255,.09)',
            darkItemColor: 'rgba(255,255,255,.72)',
            darkItemSelectedColor: '#fff',
            itemMarginInline: 10,
          },
        },
      }}
    >
      <BrowserRouter>
        <RouteTransitionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="jobs" element={<Jobs />} />
            <Route path="jobs/:id/editor" element={<JobEditor />} />
            <Route path="components" element={<Components />} />
            <Route
              path="users"
              element={
                <RequireAdmin>
                  <Users />
                </RequireAdmin>
              }
            />
            <Route path="monitor" element={<Monitor />} />
            <Route path="*" element={<Navigate to="/jobs" replace />} />
          </Route>
        </Routes>
        </RouteTransitionProvider>
      </BrowserRouter>
    </ConfigProvider>
    </ErrorBoundary>
  );
}
