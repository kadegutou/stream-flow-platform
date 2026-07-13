import { Routes, Route, Navigate } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import Dashboard from './pages/Dashboard'
import UserList from './pages/Users/UserList'
import ComponentList from './pages/Components/ComponentList'
import JobList from './pages/Jobs/JobList'
import JobEditor from './pages/Jobs/Editor/JobEditor'
import JobDetail from './pages/Jobs/Detail/JobDetail'

function App() {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="users" element={<UserList />} />
        <Route path="components" element={<ComponentList />} />
        <Route path="jobs" element={<JobList />} />
        <Route path="jobs/editor/:id" element={<JobEditor />} />
        <Route path="jobs/detail/:id" element={<JobDetail />} />
      </Route>
    </Routes>
  )
}

export default App
