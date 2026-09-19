import type { InstanceStatus } from '../types';
import { useThemeStore } from '../store/theme';
import { Chip } from './Chip';

/** 状态语义色：浅色模式用深一档，暗色模式用亮一档，保证两种模式下对比度都够。 */
const STATUS_META: Record<InstanceStatus, { label: string; light: string; dark: string }> = {
  PENDING: { label: '待运行', light: '#d48806', dark: '#ffc53d' },
  RUNNING: { label: '运行中', light: '#389e0d', dark: '#73d13d' },
  STOPPING: { label: '停止中', light: '#d46b08', dark: '#ffa940' },
  STOPPED: { label: '已停止', light: '#8c8c8c', dark: '#bfbfbf' },
  FAILED: { label: '失败', light: '#cf1322', dark: '#ff7875' },
};

/** 实例状态标签：圆点 + 语义色胶囊。运行中带脉冲动效，一眼看出「正在跑」。 */
export function StatusTag({ status }: { status: InstanceStatus | null | undefined }) {
  const dark = useThemeStore((s) => s.dark);
  if (!status) {
    return <Chip color={dark ? '#bfbfbf' : '#8c8c8c'} label="未上线" />;
  }
  const meta = STATUS_META[status];
  return (
    <Chip
      color={dark ? meta.dark : meta.light}
      label={meta.label}
      pulsing={status === 'RUNNING'}
    />
  );
}
