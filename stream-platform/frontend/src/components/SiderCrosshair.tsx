import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

/**
 * 侧边栏专用十字框：鼠标悬停在菜单条上时，四角括号把这一条框住。
 *
 * 与首页那套的关系：首页用的是 Home 内的 CrosshairCursor（全屏十字框，框所有可交互元素），
 * 组件卸载时 `body:has(.sp-home-crosshair)` 失效、系统光标自动恢复。本组件负责首页之外的场景，
 * 因此路由落在 /home 时直接不渲染，避免和首页的十字框重复描边。
 *
 * 系统光标的隐藏见 global.css 的 `body:not(:has(.sp-home-crosshair)) .sp-sider-item`：
 * 只管菜单条，页面其他区域保持默认光标。
 */
interface ItemRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 四角和目标边缘的间距 */
const GAP = 4;
/** 角括号边长 */
const CORNER = 8;

export default function SiderCrosshair({ dark }: { dark: boolean }) {
  const { pathname } = useLocation();
  const isHome = pathname.startsWith('/home');
  const [rect, setRect] = useState<ItemRect | null>(null);

  useEffect(() => {
    // 首页由 Home 的 CrosshairCursor 全权接管；触屏/粗指针设备也不出十字框
    if (isHome || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      setRect(null);
      return;
    }

    const onMove = (e: MouseEvent) => {
      const item = (e.target as HTMLElement | null)?.closest?.('.sp-sider-item');
      if (!item) {
        setRect(null); // 移出菜单条：十字框淡出，恢复默认光标
        return;
      }
      const r = item.getBoundingClientRect();
      setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };

    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [isHome]);

  if (isHome) return null;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;

  const color = dark ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.6)';
  const w = rect ? rect.w + GAP * 2 : 0;
  const h = rect ? rect.h + GAP * 2 : 0;
  const cx = rect ? rect.x + rect.w / 2 : 0;
  const cy = rect ? rect.y + rect.h / 2 : 0;

  // 挂到 body：跨出内容区，保证不被侧边栏（zIndex:10）之外的内容子树层级干扰
  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: w,
        height: h,
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: rect ? 1 : 0,
        transition: 'opacity 0.15s, width 0.2s ease-out, height 0.2s ease-out',
        transform: `translate(${cx - w / 2}px, ${cy - h / 2}px)`,
      }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, width: CORNER, height: CORNER, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: CORNER, height: CORNER, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: CORNER, height: CORNER, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: CORNER, height: CORNER, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }} />
    </div>,
    document.body,
  );
}
