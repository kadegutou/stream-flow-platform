import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Component, lazy, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { App as AntdApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Login from './pages/Login';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';
import { RouteTransitionProvider, useRouteTransition } from './components/RouteTransition';
import { appMessage, bindAppInstances } from './utils/antdApp';
import { setUnauthorizedHandler } from './api/session';

// 路由级懒加载：登录页与整体框架先加载，业务页面按需拉取（首屏更小更快）
// AppLayout 同样懒加载：菜单/布局等只有登录后才需要，首屏不为它们付体积
const AppLayout = lazy(() => import('./components/AppLayout'));
const Home = lazy(() => import('./pages/Home'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobEditor = lazy(() => import('./pages/JobEditor'));
const Components = lazy(() => import('./pages/Components'));
const Users = lazy(() => import('./pages/Users'));
const Monitor = lazy(() => import('./pages/Monitor'));

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const role = useAuthStore((s) => s.role);
  if (role !== 'ADMIN') return <Navigate to="/jobs" replace />;
  return <>{children}</>;
}

/** 把 antd <App> 上下文内的 message/modal/notification 实例绑给非 React 代码使用 */
function AntdAppBridge() {
  const { message, modal, notification } = AntdApp.useApp();
  useEffect(() => {
    bindAppInstances({ message, modal, notification });
  }, [message, modal, notification]);
  return null;
}

/** 登录失效（401）桥：清登录态 + 转场回登录页，替代原先的整页硬跳 */
function SessionBridge() {
  const { transitionTo } = useRouteTransition();
  const logout = useAuthStore((s) => s.logout);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      appMessage().warning('登录已过期，请重新登录');
      logout();
      transitionTo('/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [logout, transitionTo]);
  return null;
}

/** 渲染崩溃兜底：给用户可恢复的出口，堆栈默认收起（现场演示不暴露原始报错） */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          minHeight: 'var(--sp-viewport-h)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f3f5f9',
          color: '#1f2d3d',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            background: '#fff',
            borderRadius: 12,
            padding: '28px 28px 24px',
            boxShadow: '0 8px 32px rgba(31,45,61,.12)',
          }}
        >
          <h2 style={{ margin: '0 0 10px', fontSize: 20 }}>页面出现了异常</h2>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: '#5a6072' }}>
            当前页面渲染时遇到未处理的错误，已停止渲染以保护数据。可以先重新加载，
            或返回首页继续操作；详细的报错信息已输出到浏览器控制台。
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 18px',
                fontSize: 14,
                color: '#fff',
                background: '#2f54eb',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              重新加载
            </button>
            <button
              onClick={() => window.location.assign('/home')}
              style={{
                padding: '8px 18px',
                fontSize: 14,
                color: '#1f2d3d',
                background: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              返回首页
            </button>
          </div>
          <details style={{ marginTop: 20 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, color: '#5a6072' }}>查看错误详情</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 12,
                maxHeight: 240,
                overflow: 'auto',
                fontSize: 12,
                whiteSpace: 'pre-wrap',
                background: '#f7f8fa',
                borderRadius: 8,
              }}
            >
              {String(error)}
              {'\n\n'}
              {error.stack}
            </pre>
          </details>
        </div>
      </div>
    );
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
      <AntdApp component={false}>
      <BrowserRouter>
        <RouteTransitionProvider>
        <AntdAppBridge />
        <SessionBridge />
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
      </AntdApp>
    </ConfigProvider>
    </ErrorBoundary>
  );
}
