import { Empty } from 'antd';
import { useThemeStore } from '../store/theme';
import { palette } from '../theme/palette';

/** 表格空状态：CSS 变量驱动的 SVG 插画 + 提示文案（全站统一，自动适配明暗主题） */
export function EmptyState({ description = '暂无数据' }: { description?: string }) {
  const dark = useThemeStore((s) => s.dark);
  const p = palette(dark);
  // 用调色板颜色替代硬编码浅色值，暗色模式下插画不再突兀
  const cardBg = dark ? p.surfaceAlt : '#f0f3fa';
  const headerBg = dark ? p.surfaceMuted : '#dfe6f5';
  const dotColor = dark ? p.borderStrong : '#b6c2dd';
  const lineBg = dark ? p.surfaceMuted : '#dfe6f5';
  const lineBgLight = dark ? p.borderSubtle : '#e9eef9';
  const circleBg = dark ? p.surface : '#fff';
  const circleStroke = dark ? p.borderStrong : '#c9d4ea';
  return (
    <Empty
      image={
        <svg width="120" height="88" viewBox="0 0 120 88" fill="none">
          <rect x="18" y="26" width="84" height="52" rx="6" fill={cardBg} />
          <rect x="18" y="26" width="84" height="14" rx="6" fill={headerBg} />
          <circle cx="28" cy="33" r="2.5" fill={dotColor} />
          <circle cx="37" cy="33" r="2.5" fill={dotColor} />
          <circle cx="46" cy="33" r="2.5" fill={dotColor} />
          <rect x="28" y="48" width="40" height="6" rx="3" fill={lineBg} />
          <rect x="28" y="60" width="64" height="6" rx="3" fill={lineBgLight} />
          <circle cx="88" cy="62" r="14" fill={circleBg} stroke={circleStroke} strokeWidth="2" />
          <line x1="97" y1="71" x2="106" y2="80" stroke={circleStroke} strokeWidth="3" strokeLinecap="round" />
          <line x1="82" y1="62" x2="94" y2="62" stroke={circleStroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      }
      imageStyle={{ height: 88 }}
      description={<span style={{ color: p.textSubtle, fontSize: 13 }}>{description}</span>}
    />
  );
}
