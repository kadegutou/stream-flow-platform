/**
 * 十字框的几何计算 —— 由目标元素算出「框」的包围盒。
 *
 * 单独成模块是因为 Home 的 CrosshairCursor（框卡片与侧边栏）与 SiderCrosshair
 * （只在非首页框侧边栏）都要用同一套规则，各自实现必然会漂移。
 */

/** 四角括号与目标边缘的间距 */
export const CROSSHAIR_GAP = 4;

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 算目标元素的框（已含 GAP）。
 *
 * **侧边栏菜单条要把框夹在侧边栏矩形内**，原因有两层：
 *  1. 菜单条 hover 时右移 4px，右缘会越过侧边栏（204 > 200），框再往外 4px 就到 208 ——
 *     那 8px 落在右侧内容区上；浅色模式下那里是白底，而侧边栏上的框是白色（深色栏底），
 *     白框压白底等于看不见。
 *  2. 菜单条本身被 nav 的 overflow-x: hidden 裁在栏内，可见边缘就是栏的右边界。
 *     夹到边界后，框反而**正好贴住菜单条的可见边缘**；不夹的话框会比菜单条宽出 8px，贴不齐。
 *
 * 其余目标（首页卡片）不夹，按常规「目标矩形外扩 GAP」处理。
 */
export function frameBoxOf(el: Element): FrameBox {
  const r = el.getBoundingClientRect();
  const host = el.closest('.ant-layout-sider');
  if (!host) {
    return { x: r.left - CROSSHAIR_GAP, y: r.top - CROSSHAIR_GAP, w: r.width + CROSSHAIR_GAP * 2, h: r.height + CROSSHAIR_GAP * 2 };
  }
  const hr = host.getBoundingClientRect();
  const left = Math.max(r.left - CROSSHAIR_GAP, hr.left);
  const right = Math.min(r.right + CROSSHAIR_GAP, hr.right);
  return { x: left, y: r.top - CROSSHAIR_GAP, w: right - left, h: r.height + CROSSHAIR_GAP * 2 };
}
