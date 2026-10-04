import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useFontScaleStore } from '../store/theme';
import { frameBoxOf, type FrameBox } from '../utils/crosshair';

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
/** 角括号边长 */
const CORNER = 8;

export default function SiderCrosshair() {
  const { pathname } = useLocation();
  const isHome = pathname.startsWith('/home');
  const [rect, setRect] = useState<FrameBox | null>(null);
  // 必须放在下方 early return 之前：isHome 随路由变化，若把 hooks 放在 return 之后，
  // 从 /jobs 切到 /home 时 hook 数量会变，React 会直接抛错。
  const z = useFontScaleStore((s) => s.scale) || 1;

  const targetRef = useRef<Element | null>(null);
  /** 矩形没变时返回原对象，React 跳过重渲染 —— 逐帧重同步靠它避免空转渲染 */
  const syncRect = useCallback((el: Element) => {
    // frameBoxOf 已把间距算进去，并把框夹在侧边栏矩形内（菜单条 hover 右移会越过侧边栏，
    // 框若不夹就会落到右侧内容区上 —— 浅色模式下那里是白底，白框压白底看不见）
    const box = frameBoxOf(el);
    setRect((prev) =>
      prev && prev.x === box.x && prev.y === box.y && prev.w === box.w && prev.h === box.h
        ? prev
        : box,
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

  /*
   * 恒定浅色，**不看主题**：侧边栏在浅色/深色两套调色板里用的是同一个深蓝渐变
   * （palette.ts 的 brandDeepGradient，两处都是 #141e30 → #243b55）。
   * 按主题取色时，浅色模式会画成黑色落在深蓝上，实测对比度仅 1.16:1（等于看不见）；
   * 换成 rgba(255,255,255,.75) 后对比度 10.1:1。
   * 这也是本组件不再接收 dark prop 的原因 —— 它只框侧边栏，没有第二种情况。
   */
  const color = 'rgba(255,255,255,.75)';
  // rect 已是"框"的矩形（间距含在内），此处不再加
  const w = rect ? rect.w : 0;
  const h = rect ? rect.h : 0;
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
