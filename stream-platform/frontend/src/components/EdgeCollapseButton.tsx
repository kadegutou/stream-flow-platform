import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';

/**
 * 侧栏折叠按钮的浮出逻辑：鼠标靠近容器右边缘中部时才显示按钮。
 * 导航栏（AppLayout）与控件栏（JobEditor）共用同一套判据。
 */
export function useEdgeHover(edgeZone = 40, middleBand = 100) {
  const [hover, setHover] = useState(false);
  const handlers = {
    onMouseMove: (e: ReactMouseEvent<HTMLElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const nearRight = rect.right - e.clientX <= edgeZone;
      const nearMiddle = Math.abs(e.clientY - (rect.top + rect.height / 2)) <= middleBand;
      setHover(nearRight && nearMiddle);
    },
    onMouseLeave: () => setHover(false),
  };
  return { hover, handlers };
}

/**
 * 侧栏折叠按钮：半透明、垂直居中、直边贴栏、外侧半圆。
 * 用 <button> 而非 <div>，键盘可聚焦/回车触发，并提供 aria-label 与 aria-expanded。
 */
export function EdgeCollapseButton({
  collapsed,
  onToggle,
  dark,
  label,
}: {
  collapsed: boolean;
  onToggle: () => void;
  dark: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      className="sp-edge-toggle"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      style={{
        position: 'absolute',
        top: '50%',
        right: -16,
        transform: 'translateY(-50%)',
        width: 26,
        height: 60,
        padding: 0,
        borderRadius: '0 26px 26px 0',
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
    </button>
  );
}
