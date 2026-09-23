import type { ComponentCategory } from '../types';
import { useThemeStore } from '../store/theme';
import { Chip } from './Chip';
import { CATEGORY_LABEL, categoryColor } from '../theme/category';

/** 控件分类标签：输入/处理/输出三色胶囊，与状态标签同一套视觉语言。 */
export function CategoryTag({ category }: { category: ComponentCategory }) {
  const dark = useThemeStore((s) => s.dark);
  return <Chip color={categoryColor(category, dark)} label={`${category} ${CATEGORY_LABEL[category]}`} />;
}
