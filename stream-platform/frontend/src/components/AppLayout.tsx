import { Layout, Dropdown, Avatar, Space, Breadcrumb, Spin } from 'antd';
import {
  AppstoreOutlined,
  UnorderedListOutlined,
  UserOutlined,
  MonitorOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  ThunderboltFilled,
  HomeOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation } from 'react-router-dom';
import { useRouteTransition } from './RouteTransition';
import { EdgeCollapseButton, useEdgeHover } from './EdgeCollapseButton';
import { IconActionButton } from './IconActionButton';
import { Suspense, useMemo, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { MAX_FONT_SCALE, MIN_FONT_SCALE, useFontScaleStore, useThemeStore } from '../store/theme';
import { appMessage } from '../utils/antdApp';
import { palette } from '../theme/palette';
import { SPACING, FONT_SIZE, RADIUS } from '../theme/tokens';

const { Sider, Header, Content } = Layout;

// 画布是作业的子页面（/jobs/:id/editor），从作业管理的「编辑画布」进入，不单列菜单
const menuItems = [
  { key: '/home', icon: <HomeOutlined />, label: '首页', sub: 'DASHBOARD', adminOnly: false },
  { key: '/jobs', icon: <UnorderedListOutlined />, label: '作业管理', sub: 'JOB ORCHESTRATION', adminOnly: false },
  { key: '/components', icon: <AppstoreOutlined />, label: '控件列表', sub: 'COMPONENT REGISTRY', adminOnly: false },
  { key: '/users', icon: <UserOutlined />, label: '用户管理', sub: 'USER ADMINISTRATION', adminOnly: true },
  { key: '/monitor', icon: <MonitorOutlined />, label: '运行监控', sub: 'RUNTIME MONITOR', adminOnly: false },
];

export default function AppLayout() {
  const { transitionTo, transitionLogout } = useRouteTransition();
  const location = useLocation();
  const { nickname, role, logout } = useAuthStore();
  const { dark, toggle } = useThemeStore();
  const { scale, increase, decrease } = useFontScaleStore();
  const p = palette(dark);
  const [collapsed, setCollapsed] = useState(false);
  const { hover: siderHover, handlers: siderHoverHandlers } = useEdgeHover();

  const visibleMenuItems = useMemo(
    () => menuItems.filter((m) => !m.adminOnly || role === 'ADMIN'),
    [role],
  );

  /** 字体缩放按钮的颜色：到达上下限时变暗，提示不可再调 */
  const scaleBtnColor = (atLimit: boolean) =>
    atLimit ? p.textDisabled : dark ? p.text : p.textMuted;

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
            <button
              type="button"
              className="sp-link-button"
              onClick={() => transitionTo('/jobs')}
            >
              作业管理
            </button>
          ),
        },
        { title: '编辑画布' },
      ]
    : [{ title: currentLabel }];

  const handleLogout = () => {
    // 先播转场，黑幕盖住后清登录态，转场结束后再提示
    transitionLogout(
      () => logout(),
      () => appMessage().success('已退出登录'),
    );
  };

  return (
    <Layout style={{ minHeight: 'var(--sp-viewport-h)' }}>
      {/* 折叠后保留 16px 触发条；仅当鼠标靠近栏右边缘时浮出折叠按钮 */}
      <div
        {...siderHoverHandlers}
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
            minHeight: 'var(--sp-viewport-h)',
            display: 'flex',
            flexDirection: 'column',
            // 与登录页同一套深蓝渐变，保证进入系统后的视觉连贯
            background: p.brandDeepGradient,
            boxShadow: `2px 0 12px rgba(${p.inkRgb},.18)`,
          }}
        >
          {!collapsed && (
            <div
              style={{
                color: p.onBrand,
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
                  background: p.accentGradient,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 15,
                  flexShrink: 0,
                  boxShadow: `0 3px 10px rgba(${p.brandSeedRgb},.45)`,
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
          {/* Kylin 风格章节导航：激活项展开 + 编号 + 左侧竖条 */}
          {!collapsed && (
            <nav style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 0' }}>
              {visibleMenuItems.map((item, i) => {
                const isActive = selectedKey === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`sp-sider-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => transitionTo(item.key, { skipTransition: true })}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: isActive ? 'flex-end' : 'center',
                      alignItems: 'flex-start',
                      width: '100%',
                      height: isActive ? 96 : 52,
                      padding: isActive ? '0 14px 14px 18px' : '0 10px 0 56px',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,.06)',
                      background: isActive ? 'rgba(47,84,235,.12)' : 'transparent',
                      cursor: 'pointer',
                      position: 'relative',
                      overflow: 'hidden',
                      transition: 'height 0.4s cubic-bezier(.22,1,.36,1), background 0.18s, padding 0.35s cubic-bezier(.22,1,.36,1)',
                      font: 'inherit',
                      color: 'inherit',
                      textAlign: 'left',
                    }}
                  >
                    {/* 左侧强调色竖条（仅激活） */}
                    {isActive && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 3,
                          background: '#5b8cff',
                        }}
                      />
                    )}
                    {/* 编号 */}
                    <span
                      style={{
                        position: isActive ? 'absolute' : 'absolute',
                        left: isActive ? 14 : 14,
                        top: isActive ? 12 : '50%',
                        transform: isActive ? 'none' : 'translateY(-50%)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        lineHeight: 1,
                        transition: 'top 0.35s cubic-bezier(.22,1,.36,1), transform 0.35s cubic-bezier(.22,1,.36,1)',
                        zIndex: 0,
                      }}
                    >
                      <i
                        style={{
                          fontSize: isActive ? 9 : 7,
                          fontStyle: 'normal',
                          fontWeight: 700,
                          color: isActive ? 'rgba(91,140,255,.3)' : 'rgba(255,255,255,.25)',
                          fontFamily: 'ui-monospace, monospace',
                          letterSpacing: 1,
                          transition: 'font-size 0.35s, color 0.18s',
                        }}
                      >
                        {isActive ? 'CHAPTER' : `${String(i).padStart(2, '0')}`}
                      </i>
                      <b
                        style={{
                          fontSize: isActive ? 28 : 16,
                          fontWeight: 800,
                          color: isActive ? 'rgba(91,140,255,.2)' : 'rgba(255,255,255,.15)',
                          fontFamily: 'ui-monospace, monospace',
                          marginTop: 2,
                          transition: 'font-size 0.35s, color 0.18s',
                        }}
                      >
                        {String(i).padStart(2, '0')}
                      </b>
                    </span>
                    {/* 中文标签 */}
                    <span
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        fontSize: isActive ? 14 : 13,
                        fontWeight: 700,
                        color: isActive ? '#5b8cff' : 'rgba(255,255,255,.72)',
                        transition: 'color 0.18s, font-size 0.3s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                    {/* 英文小字（仅激活展开时可见） */}
                    <small
                      style={{
                        position: 'relative',
                        zIndex: 1,
                        fontSize: FONT_SIZE.xs - 2,
                        fontWeight: 600,
                        color: isActive ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.2)',
                        fontFamily: 'ui-monospace, monospace',
                        letterSpacing: 1,
                        opacity: isActive ? 1 : 0,
                        maxHeight: isActive ? 16 : 0,
                        transform: isActive ? 'none' : 'translateY(4px)',
                        transition: 'opacity 0.18s, max-height 0.3s, transform 0.3s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.sub}
                    </small>
                  </button>
                );
              })}
            </nav>
          )}
        </Sider>
        {/* 悬停任务栏区域时出现折叠/展开按钮 */}
        {siderHover && (
          <EdgeCollapseButton
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            dark={dark}
            label={collapsed ? '展开导航栏' : '收起导航栏'}
          />
        )}
      </div>
      <Layout>
        <Header
          style={{
            background: p.surface,
            padding: `0 ${SPACING.lg}px`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
            // 底部发丝线改为品牌蓝渐变（左→右：透明→品牌蓝→透明），替代原灰色 borderBottom
            borderBottom: 'none',
            position: 'relative',
            height: 48,
            lineHeight: '48px',
          }}
        >
          {/* 品牌蓝发丝渐变线：贴 Header 底部，1px，左→右 透明→品牌蓝→透明 */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${p.accent} 20%, ${p.accent} 80%, transparent 100%)`,
              opacity: 0.6,
              pointerEvents: 'none',
            }}
          />
          {/* 左侧：终端风格路径标签 */}
          <div
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: FONT_SIZE.xs + 1,
              letterSpacing: 1,
              color: p.textSubtle,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: p.accent, fontWeight: 700 }}>SP</span>
            <span style={{ opacity: 0.4 }}>/</span>
            <Breadcrumb
              items={breadcrumbItems}
              style={{
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: 1,
                lineHeight: '48px',
              }}
            />
          </div>
          <Space size={16}>
            {/* 字体缩放 */}
            <Space size={4}>
              <IconActionButton
                label="缩小字体"
                onClick={decrease}
                disabled={scale <= MIN_FONT_SCALE}
                color={scaleBtnColor(scale <= MIN_FONT_SCALE)}
                fontSize={13}
                fontWeight={700}
              >
                A-
              </IconActionButton>
              <span
                aria-live="polite"
                style={{
                  fontSize: 10,
                  fontFamily: 'ui-monospace, monospace',
                  color: p.textSubtle,
                  minWidth: 32,
                  textAlign: 'center',
                  userSelect: 'none',
                }}
              >
                {Math.round(scale * 100)}%
              </span>
              <IconActionButton
                label="放大字体"
                onClick={increase}
                disabled={scale >= MAX_FONT_SCALE}
                color={scaleBtnColor(scale >= MAX_FONT_SCALE)}
                fontSize={15}
                fontWeight={700}
              >
                A+
              </IconActionButton>
            </Space>
            {/* 明暗主题切换 */}
            <IconActionButton
              label={dark ? '切换为浅色模式' : '切换为暗色模式'}
              onClick={toggle}
              color={dark ? '#f5c518' : p.textMuted}
              fontSize={17}
            >
              {dark ? <SunOutlined /> : <MoonOutlined />}
            </IconActionButton>
            {/* 分隔线 */}
            <span style={{ width: 1, height: 20, background: p.borderHairline }} />
            {/* 用户区：等宽字体紧凑布局 */}
            <Dropdown
              menu={{
                items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: handleLogout }],
              }}
            >
              <div
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: FONT_SIZE.xs + 1,
                  letterSpacing: 0.5,
                  color: dark ? p.text : undefined,
                }}
              >
                <Avatar size={24} icon={<UserOutlined />} />
                <span style={{ fontWeight: 700 }}>{nickname || '用户'}</span>
                {role && (
                  <span
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: p.accent,
                      background: dark ? 'rgba(47,84,235,.15)' : 'rgba(47,84,235,.08)',
                      padding: '1px 5px',
                      borderRadius: RADIUS.sm - 2,
                      letterSpacing: 1,
                    }}
                  >
                    {role}
                  </span>
                )}
              </div>
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
