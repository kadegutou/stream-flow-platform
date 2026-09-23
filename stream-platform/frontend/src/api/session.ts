/**
 * 401（登录失效）上报出口。
 *
 * axios 拦截器不在 React 树内，拿不到 Router 与路由转场上下文，因此用注册回调的方式上报：
 * `<SessionBridge />` 在 RouteTransitionProvider 里注册处理函数，实现「清登录态 + 转场回登录页」。
 * 这替代了原先的 `window.location.href = '/login'`——整页硬跳既绕过 Router，又会打断
 * 正在播放的转场，且 zustand 里的登录态要等整页重载才归零。
 */
type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;
let lastHandledAt = 0;

export function setUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

/** 并发请求同时 401 时只处理一次（3s 内去抖），避免提示与跳转重复触发。 */
export function notifyUnauthorized(): void {
  const now = Date.now();
  if (now - lastHandledAt < 3000) return;
  lastHandledAt = now;
  if (handler) {
    handler();
  } else {
    // 兜底：桥尚未挂载（极少见）时仍能回到登录页
    window.location.replace('/login');
  }
}
