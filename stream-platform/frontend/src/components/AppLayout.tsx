import { Layout, Menu, Dropdown, Avatar, Space, message } from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  UserOutlined,
  MonitorOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuthStore } from '../store/auth';

const { Sider, Header, Content } = Layout;

// 画布是作业的子页面（/jobs/:id/editor），从作业管理的「编辑画布」进入，不单列菜单
const menuItems = [
  { key: '/jobs', icon: <UnorderedListOutlined />, label: '作业管理', adminOnly: false },
  { key: '/components', icon: <AppstoreOutlined />, label: '控件列表', adminOnly: false },
  { key: '/users', icon: <UserOutlined />, label: '用户管理', adminOnly: true },
  { key: '/monitor', icon: <MonitorOutlined />, label: '运行监控', adminOnly: false },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { nickname, role, logout } = useAuthStore();

  const visibleMenuItems = useMemo(
    () => menuItems.filter((m) => !m.adminOnly || role === 'ADMIN'),
    [role],
  );

  // 编辑器路由 /jobs/:id/editor 高亮「作业管理」
  const selectedKey = location.pathname.startsWith('/jobs')
    ? '/jobs'
    : visibleMenuItems.find((m) => location.pathname.startsWith(m.key))?.key ?? '/jobs';

  const handleLogout = () => {
    logout();
    message.success('已退出登录');
    navigate('/login');
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="dark">
        <div
          style={{
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            padding: '18px 16px',
            lineHeight: 1.4,
          }}
        >
          通用流处理
          <br />
          任务管理平台
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={visibleMenuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          }}
        >
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <span>{nickname || '用户'}</span>
              {role && <span style={{ color: '#999', fontSize: 12 }}>({role === 'ADMIN' ? '管理员' : '普通用户'})</span>}
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
