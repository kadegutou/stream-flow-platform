import type { InstanceStatus } from '../types';
import { useThemeStore } from '../store/theme';
import { palette, type Palette } from '../theme/palette';
import { Chip } from './Chip';

/**
 * 状态语义色：取调色板里 600 档（分类色用 500 档），浅色深一档、暗色亮一档，
 * 两种模式下的对比度都够。
 */
const STATUS_TONE: Record<InstanceStatus, keyof Palette> = {
  PENDING: 'gold',
  RUNNING: 'successStrong',
  STOPPING: 'warningStrong',
  STOPPED: 'neutral',
  FAILED: 'dangerStrong',
};

const STATUS_LABEL: Record<InstanceStatus, string> = {
  PENDING: '待运行',
  RUNNING: '运行中',
  STOPPING: '停止中',
  STOPPED: '已停止',
  FAILED: '失败',
};

/** 实例状态标签：圆点 + 语义色胶囊。运行中带脉冲动效，一眼看出「正在跑」。 */
export function StatusTag({ status }: { status: InstanceStatus | null | undefined }) {
  const dark = useThemeStore((s) => s.dark);
  const p = palette(dark);
  if (!status) {
    return <Chip color={p.neutral} label="未上线" />;
  }
  return (
    <Chip
      color={String(p[STATUS_TONE[status]])}
      label={STATUS_LABEL[status]}
      pulsing={status === 'RUNNING'}
    />
  );
}
