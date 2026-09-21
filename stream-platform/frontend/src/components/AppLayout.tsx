import { Layout, Menu, Dropdown, Avatar, Space, message, Breadcrumb, Spin } from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  UserOutlined,
  MonitorOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  LeftOutlined,
  RightOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { Outlet, useLocation } from 'react-router-dom';
import { useRouteTransition } from './RouteTransition';
import { Suspense, useMemo, useState } from 'react';
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
  const { transitionTo, transitionLogout } = useRouteTransition();
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

  // Header 左侧面包屑：编辑器页显示「作业管理 / 编辑画布」，其余显示当前页名
  const isEditor = /^\/jobs\/\d+\/editor/.test(location.pathname);
  const currentLabel =
    menuItems.find((m) => location.pathname.startsWith(m.key))?.label ?? '作业管理';
  const breadcrumbItems = isEditor
    ? [
        {
          title: (
            <span
              onClick={() => transitionTo('/jobs')}
              style={{ cursor: 'pointer', color: 'inherit' }}
            >
              作业管理
            </span>
          ),
        },
        { title: '编辑画布' },
      ]
    : [{ title: currentLabel }];

  const handleLogout = () => {
    // 先播转场，黑幕盖住后再清登录态，避免页面先跳到登录页
    transitionLogout(() => {
      logout();
      message.success('已退出登录');
    });
  };

  const collapseBtn = (
    <div
      onClick={() => setCollapsed(!collapsed)}
      title={collapsed ? '展开导航栏' : '收起导航栏'}
      style={{
        position: 'absolute',
        top: '50%',
        right: -16,
        transform: 'translateY(-50%)',
        width: 26,
        height: 60,
        borderRadius: '0 26px 26px 0',
        // 底色随明暗模式适配：暗色下用低透明白，浅色下用悬浮白 + 描边
        background: dark ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.92)',
        border: `1px solid ${dark ? 'rgba(255,255,255,.16)' : 'rgba(20,30,48,.1)'}`,
        borderLeft: 'none',
        boxShadow: dark ? 'none' : '0 2px 8px rgba(20,30,48,.12)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 20,
        color: dark ? 'rgba(255,255,255,.75)' : '#5a6072',
        fontSize: 11,
        userSelect: 'none',
        transition: 'background .2s, color .2s',
      }}
    >
      {collapsed ? <RightOutlined /> : <LeftOutlined />}
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
        style={{ position: 'relative', zIndex: 10, display: 'flex', alignSelf: 'stretch' }}
      >
        <Sider
          theme="dark"
          collapsed={collapsed}
          collapsedWidth={16}
          width={200}
          trigger={null}
          style={{
            height: 'auto',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            // 与登录页同一套深蓝渐变，保证进入系统后的视觉连贯
            background: 'linear-gradient(180deg, #141e30 0%, #243b55 100%)',
            boxShadow: '2px 0 12px rgba(20,30,48,.18)',
          }}
        >
          {!collapsed && (
            <div
              style={{
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                padding: '18px 16px',
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {/* 品牌标记：与登录页深蓝渐变呼应 */}
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #2f54eb 0%, #5b8cff 100%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  flexShrink: 0,
                  boxShadow: '0 3px 10px rgba(47,84,235,.45)',
                }}
              >
                <ThunderboltFilled />
              </span>
              <span>
                通用流处理
                <br />
                任务管理平台
              </span>
            </div>
          )}
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selectedKey]}
            items={collapsed ? [] : visibleMenuItems}
            onClick={({ key }) => transitionTo(key)}
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
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,.06)' : 'rgba(20,30,48,.06)'}`,
          }}
        >
          {/* 左侧：当前位置（原为空白，进系统后缺少方位感） */}
          <Breadcrumb items={breadcrumbItems} style={{ fontSize: 13 }} />
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
        <Content className="sp-content" style={{ margin: 16 }}>
          {/* key 随路由变化 → 每次切页重放入场动画；Suspense 只替换内容区，布局不闪 */}
          <div key={location.pathname} className="sp-page-enter">
            <Suspense
              fallback={
                <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
                  <Spin size="large" />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
