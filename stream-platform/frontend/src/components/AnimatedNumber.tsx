import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../utils/motion';

/** easeOutExpo：起步快、末尾缓，数字滚动观感更自然 */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * 数字滚动动画：挂载时从 0 滚到目标值，后续值变化时从当前值平滑过渡。
 * 用于监控页指标卡与首页统计条，让数值变化在演示时可见。
 * 尊重 prefers-reduced-motion：减少动态时直接跳变不滚动。
 */
export function AnimatedNumber({
  value,
  duration = 900,
  format = (n: number) => n.toLocaleString(),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number>();

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (to - from) * easeOutExpo(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to; // 动画被打断（值又变了）时，以当前目标作为新起点
    };
  }, [value, duration, reduced]);

  return <>{format(Math.round(display))}</>;
}
