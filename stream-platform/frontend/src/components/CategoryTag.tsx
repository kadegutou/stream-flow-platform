import type { ComponentCategory } from '../types';
import { useThemeStore } from '../store/theme';
import { Chip } from './Chip';

/** 分类色：与画布节点色条（JobEditor 的 CATEGORY_HEX）保持同一套 */
export const CATEGORY_HEX: Record<ComponentCategory, string> = {
  SOURCE: '#52c41a',
  PROCESS: '#2f54eb',
  SINK: '#fa8c16',
};

/** 暗色模式下用亮一档，避免深色底上对比度不足 */
const CATEGORY_HEX_DARK: Record<ComponentCategory, string> = {
  SOURCE: '#73d13d',
  PROCESS: '#5b8cff',
  SINK: '#ffa940',
};

export const CATEGORY_LABEL: Record<ComponentCategory, string> = {
  SOURCE: '输入',
  PROCESS: '处理',
  SINK: '输出',
};

/** 控件分类标签：输入/处理/输出三色胶囊，与状态标签同一套视觉语言。 */
export function CategoryTag({ category }: { category: ComponentCategory }) {
  const dark = useThemeStore((s) => s.dark);
  const color = (dark ? CATEGORY_HEX_DARK : CATEGORY_HEX)[category];
  return <Chip color={color} label={`${category} ${CATEGORY_LABEL[category]}`} />;
}
