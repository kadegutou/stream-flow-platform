import type { ReactNode } from 'react';
import { Typography } from 'antd';
import { useThemeStore } from '../store/theme';
import { palette } from '../theme/palette';

/** 页面标题区：图标徽章 + 标题 + 副标题说明（全站统一） */
export function PageHeader({
  icon,
  title,
  subtitle,
  extra,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  extra?: ReactNode;
}) {
  const dark = useThemeStore((s) => s.dark);
  const p = palette(dark);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: p.accentGradient,
            color: p.onBrand,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            boxShadow: `0 4px 12px rgba(${p.brandSeedRgb},.28)`,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>
        <div>
          <Typography.Title level={4} style={{ margin: 0, lineHeight: 1.3 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
      </div>
      {extra && <div>{extra}</div>}
    </div>
  );
}
