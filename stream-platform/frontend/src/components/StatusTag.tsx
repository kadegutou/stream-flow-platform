import { Tag } from 'antd';
import type { InstanceStatus } from '../types';

const STATUS_COLOR: Record<InstanceStatus, string> = {
  PENDING: 'gold',
  RUNNING: 'green',
  STOPPING: 'orange',
  STOPPED: 'default',
  FAILED: 'red',
};

const STATUS_LABEL: Record<InstanceStatus, string> = {
  PENDING: '待运行',
  RUNNING: '运行中',
  STOPPING: '停止中',
  STOPPED: '已停止',
  FAILED: '失败',
};

export function StatusTag({ status }: { status: InstanceStatus | null | undefined }) {
  if (!status) return <Tag>未上线</Tag>;
  return <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>;
}
