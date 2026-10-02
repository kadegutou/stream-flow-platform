import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { palette } from '../theme/palette';

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
 * 侧栏折叠按钮：品牌蓝渐变圆形徽章，带发光边框和阴影。
 * hover 时微放大 + 光晕增强，与平台 Kylin 风格呼应。
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
  const p = palette(dark);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="sp-edge-toggle"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: '50%',
        right: -14,
        transform: `translateY(-50%) scale(${hovered ? 1.12 : 1})`,
        width: 28,
        height: 28,
        padding: 0,
        borderRadius: '50%',
        background: p.accentGradient,
        border: `1.5px solid ${dark ? `rgba(${p.accentLightRgb},.5)` : `rgba(${p.brandSeedRgb},.3)`}`,
        boxShadow: hovered
          ? `0 0 16px rgba(${p.brandSeedRgb},.5), 0 4px 12px rgba(${p.inkRgb},.25)`
          : `0 2px 8px rgba(${p.brandSeedRgb},.35), 0 1px 3px rgba(${p.inkRgb},.15)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        zIndex: 20,
        color: '#fff',
        fontSize: 11,
        userSelect: 'none',
        transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease',
      }}
    >
      {collapsed ? <RightOutlined style={{ fontSize: 10, fontWeight: 700 }} /> : <LeftOutlined style={{ fontSize: 10, fontWeight: 700 }} />}
    </button>
  );
}
