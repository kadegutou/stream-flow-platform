import type { ReactNode } from 'react';

/**
 * 头部的小图标操作（字体缩放 / 明暗切换）。
 * 原先用 <span onClick> 实现，键盘无法聚焦、读屏也读不出用途；换成原生 button + aria-label。
 */
export function IconActionButton({
  label,
  onClick,
  disabled = false,
  color,
  fontSize = 14,
  fontWeight = 400,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
  fontSize?: number;
  fontWeight?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="sp-icon-action"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 6px',
        border: 'none',
        background: 'transparent',
        font: 'inherit',
        fontSize,
        fontWeight,
        lineHeight: 1.4,
        color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        borderRadius: 4,
        transition: 'color .2s',
      }}
    >
      {children}
    </button>
  );
}
