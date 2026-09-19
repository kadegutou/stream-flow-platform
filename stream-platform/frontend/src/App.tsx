import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Jobs from './pages/Jobs';
import JobEditor from './pages/JobEditor';
import Components from './pages/Components';
import Users from './pages/Users';
import Monitor from './pages/Monitor';
import { useAuthStore } from './store/auth';
import { useThemeStore } from './store/theme';

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
        },
        components: {
          Table: {
            headerBg: dark ? '#1b2334' : '#fafbfd',
            headerColor: dark ? '#9aa6bd' : '#5a6072',
            rowHoverBg: dark ? '#1d2942' : '#eef3ff',
          },
          Card: { paddingLG: 20 },
        },
      }}
    >
      <BrowserRouter>
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
            <Route index element={<Navigate to="/jobs" replace />} />
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
      </BrowserRouter>
    </ConfigProvider>
    </ErrorBoundary>
  );
}
