import { Button, Card, ConfigProvider, Form, Input, theme as antdTheme } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  ApartmentOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { useRouteTransition } from '../components/RouteTransition';
import { useState } from 'react';
import { login, register } from '../api/auth';
import { showApiError } from '../api/request';
import { appMessage } from '../utils/antdApp';
import { useAuthStore } from '../store/auth';
import { palette } from '../theme/palette';

/**
 * 登录页外观固定为深色（不随全局主题切换），因此直接取暗色档调色板。
 * 模块级取一次即可，不需要跟随主题变化。
 */
const LOGIN = palette(true);

const FEATURES = [
  { icon: <ApartmentOutlined />, text: '拖拽式数据流编排，20 种内置控件' },
  { icon: <ThunderboltOutlined />, text: '虚拟线程流水线，55.6 万行/秒吞吐' },
  { icon: <PartitionOutlined />, text: 'Worker 集群横向扩展，故障自动自愈' },
];

/** 背景流动线条：虚线沿波浪路径缓慢移动，呼应「流处理」主题 */
function FlowBackground() {
  const paths = [
    'M -100 180 C 300 100, 520 260, 920 180 S 1300 100, 1500 180',
    'M -100 360 C 250 280, 600 440, 1000 360 S 1300 280, 1500 360',
    'M -100 540 C 350 460, 560 620, 960 540 S 1300 460, 1500 540',
    'M -100 700 C 280 640, 640 760, 1040 700 S 1320 640, 1500 700',
  ];
  return (
    <svg
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.55,
      }}
    >
      <defs>
        <linearGradient id="sp-flow-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={LOGIN.accent} stopOpacity="0" />
          <stop offset="45%" stopColor={LOGIN.accentStrong} stopOpacity="0.85" />
          <stop offset="55%" stopColor={LOGIN.accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={LOGIN.brandSeed} stopOpacity="0" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="url(#sp-flow-grad)"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeDasharray="140 500"
          className="sp-flow-line"
          style={{ animationDuration: `${9 + i * 2.5}s`, animationDelay: `${i * -1.8}s` }}
        />
      ))}
    </svg>
  );
}

export default function Login() {
  const { transitionLogin } = useRouteTransition();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'login' | 'register'>('login');

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login(values);
      setAuth(res.token, res.nickname, res.role);
      transitionLogin('/home', () => appMessage().success(`欢迎，${res.nickname}`));
    } catch (e) {
      showApiError(e, '登录失败，请检查用户名或密码');
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (values: { username: string; password: string; nickname: string }) => {
    setLoading(true);
    try {
      const res = await register(values);
      setAuth(res.token, res.nickname, res.role);
      transitionLogin('/home', () => appMessage().success(`注册成功，欢迎，${res.nickname}`));
    } catch (e) {
      showApiError(e, '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="sp-login-page"
      style={{
        position: 'relative',
        minHeight: 'var(--sp-viewport-h)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background:
          `radial-gradient(ellipse at 20% 30%, rgba(${LOGIN.brandSeedRgb},.35) 0%, transparent 50%),` +
          `radial-gradient(ellipse at 80% 70%, rgba(${LOGIN.successRgb},.18) 0%, transparent 50%),` +
          LOGIN.brandDeepGradientDiagonal,
      }}
    >
      <FlowBackground />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 72,
          padding: 24,
        }}
      >
        {/* 左侧品牌区 */}
      <div style={{ color: LOGIN.onBrand, maxWidth: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: LOGIN.accentGradient,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: `0 6px 20px rgba(${LOGIN.brandSeedRgb},.5)`,
                flexShrink: 0,
              }}
            >
              <ThunderboltFilled />
            </span>
            <span
              style={{
                fontSize: 12,
                letterSpacing: 2.5,
                color: `rgba(${LOGIN.whiteRgb},.5)`,
                textTransform: 'uppercase',
              }}
            >
              Stream Platform
            </span>
          </div>

          <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.3, letterSpacing: 1 }}>
            通用流处理
            <br />
            任务管理平台
          </div>
          <div style={{ marginTop: 12, fontSize: 14, color: `rgba(${LOGIN.whiteRgb},.65)`, lineHeight: 1.8 }}>
            面向流量接入、字段补数、格式转换、多路转发场景，
            拖拉拽编排数据治理作业，一键上线持续处理。
          </div>
          <div style={{ marginTop: 32 }}>
            {FEATURES.map((f) => (
              <div
                key={f.text}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 14,
                  color: `rgba(${LOGIN.whiteRgb},.85)`,
                  fontSize: 14,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `rgba(${LOGIN.whiteRgb},.12)`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {f.icon}
                </span>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧登录卡：深色玻璃拟态，与背景同色系；固定深色不随全局主题切换 */}
        <ConfigProvider
          theme={{
            algorithm: antdTheme.darkAlgorithm,
            token: { colorPrimary: LOGIN.accent, borderRadius: 8 },
            components: {
              Input: {
                colorBgContainer: `rgba(${LOGIN.whiteRgb},.08)`,
                colorBorder: `rgba(${LOGIN.accentLightRgb},.28)`,
                colorText: LOGIN.textOnDeep,
                colorTextPlaceholder: `rgba(${LOGIN.whiteRgb},.35)`,
                colorIcon: `rgba(${LOGIN.whiteRgb},.45)`,
                activeBorderColor: LOGIN.accent,
                hoverBorderColor: LOGIN.accent,
              },
            },
          }}
        >
        <Card
          style={{
            width: 380,
            borderRadius: 16,
            background: `rgba(${LOGIN.inkRgb},.55)`,
            backdropFilter: 'blur(14px)',
            border: `1px solid rgba(${LOGIN.accentLightRgb},.22)`,
            boxShadow: '0 20px 56px rgba(0,0,0,.45)',
          }}
          styles={{ body: { padding: '28px 28px 24px' } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: LOGIN.textOnDeep }}>
              {tab === 'login' ? '欢迎登录' : '注册账号'}
            </div>
            <div style={{ fontSize: 12, color: `rgba(${LOGIN.whiteRgb},.4)`, marginTop: 4 }}>
              Stream Processing Platform
            </div>
          </div>
          {/* 登录/注册切换 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              marginBottom: 20,
            }}
          >
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="sp-link-button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                style={{
                  fontSize: 14,
                  fontWeight: tab === t ? 700 : 400,
                  // 未选中项原为 rgba(255,255,255,.45)，在深色玻璃卡上偏灰；提到 .62
                  color: tab === t ? LOGIN.accent : `rgba(${LOGIN.whiteRgb},.62)`,
                  borderBottom: tab === t ? `2px solid ${LOGIN.accent}` : '2px solid transparent',
                  borderRadius: 0,
                  paddingBottom: 4,
                  transition: 'all 0.25s',
                }}
              >
                {t === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>
          {tab === 'login' ? (
          <Form onFinish={onFinish} size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{
                  height: 44,
                  fontWeight: 600,
                  letterSpacing: 4,
                  background: LOGIN.accentGradient,
                  border: 'none',
                  boxShadow: `0 6px 18px rgba(${LOGIN.brandSeedRgb},.35)`,
                }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>
          ) : (
          <Form onFinish={onRegister} size="large">
            <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
              <Input prefix={<UserOutlined />} placeholder="用户名" autoComplete="username" />
            </Form.Item>
            <Form.Item name="nickname" rules={[{ required: true, message: '请输入昵称' }]}>
              <Input prefix={<UserOutlined />} placeholder="昵称" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="密码" autoComplete="new-password" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{
                  height: 44,
                  fontWeight: 600,
                  letterSpacing: 4,
                  background: LOGIN.accentGradient,
                  border: 'none',
                  boxShadow: `0 6px 18px rgba(${LOGIN.brandSeedRgb},.35)`,
                }}
              >
                注 册
              </Button>
            </Form.Item>
          </Form>
          )}
        </Card>
        </ConfigProvider>
      </div>
    </div>
  );
}
