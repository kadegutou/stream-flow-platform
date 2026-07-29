import { Tag } from 'antd';
import type { ComponentCategory } from '../types';

export const CATEGORY_COLOR: Record<ComponentCategory, string> = {
  SOURCE: 'green',
  PROCESS: 'blue',
  SINK: 'orange',
};

export const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  SOURCE: '输入',
  PROCESS: '处理',
  SINK: '输出',
};

export function CategoryTag({ category }: { category: ComponentCategory }) {
  return <Tag color={CATEGORY_COLOR[category]}>{category} {CATEGORY_LABEL[category]}</Tag>;
}
