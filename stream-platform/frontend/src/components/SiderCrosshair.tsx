import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useFontScaleStore } from '../store/theme';

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
  // 必须放在下方 early return 之前：isHome 随路由变化，若把 hooks 放在 return 之后，
  // 从 /jobs 切到 /home 时 hook 数量会变，React 会直接抛错。
  const z = useFontScaleStore((s) => s.scale) || 1;

  const targetRef = useRef<Element | null>(null);
  /** 矩形没变时返回原对象，React 跳过重渲染 —— 逐帧重同步靠它避免空转渲染 */
  const syncRect = useCallback((el: Element) => {
    const r = el.getBoundingClientRect();
    setRect((prev) =>
      prev && prev.x === r.left && prev.y === r.top && prev.w === r.width && prev.h === r.height
        ? prev
        : { x: r.left, y: r.top, w: r.width, h: r.height },
    );
  }, []);

  useEffect(() => {
    // 首页由 Home 的 CrosshairCursor 全权接管；触屏/粗指针设备也不出十字框
    if (isHome || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      targetRef.current = null;
      setRect(null);
      return;
    }

    const onMove = (e: MouseEvent) => {
      const item = (e.target as HTMLElement | null)?.closest?.('.sp-sider-item') ?? null;
      targetRef.current = item;
      if (!item) {
        setRect(null); // 移出菜单条：十字框淡出，恢复默认光标
        return;
      }
      syncRect(item);
    };

    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, [isHome, syncRect]);

  // 悬停期间逐帧重读矩形：菜单条 hover 有 0.22s 位移过渡、激活项还有 0.4s 高度展开，
  // 只在 mousemove 时读会让框钉在旧位置。
  const hovering = rect !== null;
  useEffect(() => {
    if (isHome || !hovering) return;
    let raf = 0;
    const tick = () => {
      if (targetRef.current) syncRect(targetRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isHome, hovering, syncRect]);

  if (isHome) return null;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return null;

  const color = dark ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.6)';
  const w = rect ? rect.w + GAP * 2 : 0;
  const h = rect ? rect.h + GAP * 2 : 0;
  const cx = rect ? rect.x + rect.w / 2 : 0;
  const cy = rect ? rect.y + rect.h / 2 : 0;

  /*
   * portal 到 body 只是跨出了内容区，**逃不出 body 自身的 zoom** ——
   * 本层仍是 body{zoom:z} 的后代，会被再乘一次 zoom（实测 z=1.3 时下移 28px、框大 1.3 倍）。
   * 所以尺寸与位移一律除以 z，还原成层内坐标。z 取自 store，缩放变化会触发重渲染。
   */
  const vis = (v: number) => v / z;

  // 挂到 body：跨出内容区，保证不被侧边栏（zIndex:10）之外的内容子树层级干扰
  return createPortal(
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: vis(w),
        height: vis(h),
        pointerEvents: 'none',
        zIndex: 9999,
        opacity: rect ? 1 : 0,
        transition: 'opacity 0.15s, width 0.2s ease-out, height 0.2s ease-out',
        transform: `translate(${vis(cx - w / 2)}px, ${vis(cy - h / 2)}px)`,
      }}
    >
      <span style={{ position: 'absolute', top: 0, left: 0, width: vis(CORNER), height: vis(CORNER), borderTop: `${vis(2)}px solid ${color}`, borderLeft: `${vis(2)}px solid ${color}` }} />
      <span style={{ position: 'absolute', top: 0, right: 0, width: vis(CORNER), height: vis(CORNER), borderTop: `${vis(2)}px solid ${color}`, borderRight: `${vis(2)}px solid ${color}` }} />
      <span style={{ position: 'absolute', bottom: 0, left: 0, width: vis(CORNER), height: vis(CORNER), borderBottom: `${vis(2)}px solid ${color}`, borderLeft: `${vis(2)}px solid ${color}` }} />
      <span style={{ position: 'absolute', bottom: 0, right: 0, width: vis(CORNER), height: vis(CORNER), borderBottom: `${vis(2)}px solid ${color}`, borderRight: `${vis(2)}px solid ${color}` }} />
    </div>,
    document.body,
  );
}
