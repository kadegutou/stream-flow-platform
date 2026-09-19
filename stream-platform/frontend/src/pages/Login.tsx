import { Button, Card, Form, Input, message } from 'antd';
import {
  LockOutlined,
  UserOutlined,
  ApartmentOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  PartitionOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { login } from '../api/auth';
import { useAuthStore } from '../store/auth';

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
          <stop offset="0%" stopColor="#5b8cff" stopOpacity="0" />
          <stop offset="45%" stopColor="#7aa5ff" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#5b8cff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#2f54eb" stopOpacity="0" />
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
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await login(values);
      setAuth(res.token, res.nickname, res.role);
      message.success(`欢迎，${res.nickname}`);
      navigate('/jobs', { replace: true });
    } catch {
      message.error('登录失败，请检查用户名或密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background:
          'radial-gradient(ellipse at 20% 30%, rgba(47,84,235,.35) 0%, transparent 50%),' +
          'radial-gradient(ellipse at 80% 70%, rgba(82,196,26,.18) 0%, transparent 50%),' +
          'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
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
        <div style={{ color: '#fff', maxWidth: 420 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #2f54eb 0%, #5b8cff 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                boxShadow: '0 6px 20px rgba(47,84,235,.5)',
                flexShrink: 0,
              }}
            >
              <ThunderboltFilled />
            </span>
            <span
              style={{
                fontSize: 12,
                letterSpacing: 2.5,
                color: 'rgba(255,255,255,.5)',
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
          <div style={{ marginTop: 12, fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.8 }}>
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
                  color: 'rgba(255,255,255,.85)',
                  fontSize: 14,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'rgba(255,255,255,.12)',
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

        {/* 右侧登录卡：玻璃拟态，透出背景流动线条 */}
        <Card
          style={{
            width: 380,
            borderRadius: 16,
            background: 'rgba(255,255,255,.96)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,.6)',
            boxShadow: '0 20px 56px rgba(0,0,0,.4)',
          }}
          styles={{ body: { padding: '28px 28px 24px' } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1f2d3d' }}>欢迎登录</div>
            <div style={{ fontSize: 12, color: '#98a0b0', marginTop: 4 }}>
              Stream Processing Platform
            </div>
          </div>
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
                  background: 'linear-gradient(135deg, #2f54eb 0%, #5b8cff 100%)',
                  border: 'none',
                  boxShadow: '0 6px 18px rgba(47,84,235,.35)',
                }}
              >
                登 录
              </Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
}
