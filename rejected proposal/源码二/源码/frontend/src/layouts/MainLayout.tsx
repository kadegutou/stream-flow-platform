import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  UserOutlined,
  AppstoreOutlined,
  ScheduleOutlined,
  EditOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'

const { Header, Sider, Content } = Layout

// 根据当前路径决定展开的菜单和选中的菜单项
function getMenuKeys(pathname: string) {
  const selectedKey = pathname === '/' ? '/dashboard' : pathname
  // 展开包含当前路径的父菜单
  const openKeys: string[] = []
  if (pathname.startsWith('/jobs')) openKeys.push('/jobs')
  return { selectedKey, openKeys }
}

const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: '仪表盘',
  },
  {
    key: '/users',
    icon: <UserOutlined />,
    label: '用户管理',
  },
  {
    key: '/components',
    icon: <AppstoreOutlined />,
    label: '控件管理',
  },
  {
    key: '/jobs',
    icon: <ScheduleOutlined />,
    label: '作业管理',
    children: [
      {
        key: '/jobs',
        icon: <UnorderedListOutlined />,
        label: '作业列表',
      },
      {
        key: '/jobs/editor/new',
        icon: <EditOutlined />,
        label: '新建作业',
      },
    ],
  },
]

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { selectedKey, openKeys } = getMenuKeys(location.pathname)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 'bold',
          fontSize: collapsed ? 14 : 18,
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          {collapsed ? '流处理' : '邦盛·流处理平台'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={openKeys}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            通用流处理任务管理平台
          </Typography.Title>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
