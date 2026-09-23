import { useEffect, useState } from 'react';

/**
 * 系统的「减少动态效果」偏好。
 *
 * 用户开启该设置（无障碍需求、或录屏/投影时希望画面稳定）时，装饰性动画应当停掉：
 * 这里同时提供命令式版本（路由转场这类不在组件里的代码用）与 hook 版本（组件用）。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
