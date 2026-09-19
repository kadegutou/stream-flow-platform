import { Layout, Menu, Dropdown, Avatar, Space, message } from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  UserOutlined,
  MonitorOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';

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
  const { dark, toggle } = useThemeStore();
  const [collapsed, setCollapsed] = useState(false);
  const [siderHover, setSiderHover] = useState(false);

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

  const collapseBtn = (
    <div
      onClick={() => setCollapsed(!collapsed)}
      style={{
        position: 'absolute',
        top: '50%',
        right: -30,
        transform: 'translateY(-50%)',
        width: 42,
        height: 94,
        borderRadius: '0 47px 47px 0',
        background: 'rgba(255,255,255,.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 20,
        color: '#555',
        fontSize: 32,
        fontWeight: 700,
        userSelect: 'none',
      }}
    >
      {collapsed ? '»' : '«'}
    </div>
  );

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* 折叠后保留 16px 触发条；仅当鼠标靠近栏右边缘时浮出折叠按钮 */}
      <div
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const nearRight = rect.right - e.clientX <= 40;
          const nearMiddle = Math.abs(e.clientY - (rect.top + rect.height / 2)) <= 100;
          setSiderHover(nearRight && nearMiddle);
        }}
        onMouseLeave={() => setSiderHover(false)}
        style={{ position: 'relative', zIndex: 10 }}
      >
        <Sider theme="dark" collapsed={collapsed} collapsedWidth={16} width={200} trigger={null} style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
          {!collapsed && (
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
          )}
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={collapsed ? [] : visibleMenuItems}
            onClick={({ key }) => navigate(key)}
            style={{ flex: 1, minHeight: 0 }}
          />
        </Sider>
        {/* 悬停任务栏区域时出现折叠/展开按钮 */}
        {siderHover && collapseBtn}
      </div>
      <Layout>
        <Header
          style={{
            background: dark ? '#141b2b' : '#fff',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          }}
        >
          <Space size={20}>
            {/* 明暗主题切换 */}
            <span
              onClick={toggle}
              title={dark ? '切换为浅色模式' : '切换为暗色模式'}
              style={{
                cursor: 'pointer',
                fontSize: 17,
                color: dark ? '#f5c518' : '#5a6072',
                display: 'inline-flex',
                alignItems: 'center',
                transition: 'transform .3s',
              }}
            >
              {dark ? <SunOutlined /> : <MoonOutlined />}
            </span>
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }],
              }}
            >
              <Space style={{ cursor: 'pointer', color: dark ? '#d5dbea' : undefined }}>
                <Avatar icon={<UserOutlined />} />
                <span>{nickname || '用户'}</span>
                {role && <span style={{ color: '#999', fontSize: 12 }}>({role === 'ADMIN' ? '管理员' : '普通用户'})</span>}
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ margin: 16 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
