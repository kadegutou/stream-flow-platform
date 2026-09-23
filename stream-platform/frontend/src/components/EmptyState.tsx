import { Empty } from 'antd';

/** 表格空状态：简单 SVG 插画 + 提示文案（全站统一） */
export function EmptyState({ description = '暂无数据' }: { description?: string }) {
  return (
    <Empty
      image={
        <svg width="120" height="88" viewBox="0 0 120 88" fill="none">
          <rect x="18" y="26" width="84" height="52" rx="6" fill="#f0f3fa" />
          <rect x="18" y="26" width="84" height="14" rx="6" fill="#dfe6f5" />
          <circle cx="28" cy="33" r="2.5" fill="#b6c2dd" />
          <circle cx="37" cy="33" r="2.5" fill="#b6c2dd" />
          <circle cx="46" cy="33" r="2.5" fill="#b6c2dd" />
          <rect x="28" y="48" width="40" height="6" rx="3" fill="#dfe6f5" />
          <rect x="28" y="60" width="64" height="6" rx="3" fill="#e9eef9" />
          <circle cx="88" cy="62" r="14" fill="#fff" stroke="#c9d4ea" strokeWidth="2" />
          <line x1="97" y1="71" x2="106" y2="80" stroke="#c9d4ea" strokeWidth="3" strokeLinecap="round" />
          <line x1="82" y1="62" x2="94" y2="62" stroke="#c9d4ea" strokeWidth="2" strokeLinecap="round" />
        </svg>
      }
      imageStyle={{ height: 88 }}
      description={<span style={{ color: '#6b7280', fontSize: 13 }}>{description}</span>}
    />
  );
}
