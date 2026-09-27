import { tint } from '../utils/color';

/**
 * 语义胶囊标签：圆点 + 淡色底 + 同色描边，全站统一（状态、分类都用它）。
 * 比 antd Tag 的纯色块更柔和，且颜色随传入的语义色自适应。
 * 脉冲圆点带光晕扩散，一眼锁定「运行中」。
 */
export function Chip({
  color,
  label,
  pulsing,
}: {
  color: string;
  label: string;
  /** 脉冲动效（用于「运行中」这类需要一眼看出的状态） */
  pulsing?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '1px 10px 1px 8px',
        borderRadius: 999,
        fontSize: 12,
        lineHeight: '20px',
        fontWeight: 500,
        color,
        background: tint(color, 0.1),
        border: `1px solid ${tint(color, 0.26)}`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        className={pulsing ? 'sp-pulse-dot' : undefined}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
          boxShadow: pulsing ? `0 0 6px ${color}` : `0 0 3px ${tint(color, 0.4)}`,
        }}
      />
      {label}
    </span>
  );
}
