import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Login from './pages/Login';
import Jobs from './pages/Jobs';
import JobEditor from './pages/JobEditor';
import Components from './pages/Components';
import Users from './pages/Users';
import Monitor from './pages/Monitor';
import { useAuthStore } from './store/auth';

function RequireAuth({ children }: { children: JSX.Element }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
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
          <Route path="users" element={<Users />} />
          <Route path="monitor" element={<Monitor />} />
          <Route path="*" element={<Navigate to="/jobs" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
