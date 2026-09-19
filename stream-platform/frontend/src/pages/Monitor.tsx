import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Drawer, message, Table, Typography } from 'antd';
import { ReloadOutlined, RiseOutlined, DatabaseOutlined, ClockCircleOutlined, MonitorOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { listJobs } from '../api/jobs';
import { getInstanceMetrics, listJobInstances } from '../api/instances';
import type { JobInstance, JobMetric } from '../types';
import { StatusTag } from '../components/StatusTag';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

/** 渐变指标卡（监控大盘风格） */
function MetricCard({
  title,
  value,
  suffix,
  icon,
  gradient,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  gradient: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 160,
        borderRadius: 12,
        padding: '16px 20px',
        background: gradient,
        color: '#fff',
        boxShadow: '0 4px 14px rgba(31,45,61,.14)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, opacity: 0.85 }}>{title}</span>
        <span style={{ fontSize: 18, opacity: 0.85 }}>{icon}</span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 28,
          fontWeight: 700,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          lineHeight: 1.2,
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 6, opacity: 0.85 }}>{suffix}</span>}
      </div>
    </div>
  );
}

/** 简单 SVG 迷你折线图（不引重型图表库） */
function MiniLineChart({ data, width = 560, height = 160 }: { data: number[]; width?: number; height?: number }) {
  if (data.length === 0) {
    return <Typography.Text type="secondary">暂无采样数据</Typography.Text>;
  }
  const max = Math.max(...data, 1);
  const padding = 8;
  const stepX = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${padding + i * stepX},${height - padding - (v / max) * (height - padding * 2)}`)
    .join(' ');
  return (
    <svg width={width} height={height} style={{ background: '#fafafa', borderRadius: 8 }}>
      <polyline points={points} fill="none" stroke="#1677ff" strokeWidth={2} />
      {data.map((v, i) => (
        <circle
          key={i}
          cx={padding + i * stepX}
          cy={height - padding - (v / max) * (height - padding * 2)}
          r={3}
          fill="#1677ff"
        />
      ))}
      <text x={padding} y={padding + 8} fontSize={11} fill="#999">
        峰值 {max} 行/s
      </text>
    </svg>
  );
}

export default function Monitor() {
  const [instances, setInstances] = useState<JobInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [metricsInstance, setMetricsInstance] = useState<JobInstance | null>(null);
  const [metrics, setMetrics] = useState<JobMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // 汇总所有作业的实例（无全局实例接口，按作业聚合）
  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const jobs = await listJobs();
      const results = await Promise.all(
        jobs.map(async (job) => {
          try {
            const list = await listJobInstances(job.id);
            return list.map((inst) => ({ ...inst, jobName: job.name }));
          } catch {
            return [] as JobInstance[];
          }
        }),
      );
      const all = results.flat();
      all.sort((a, b) => b.id - a.id);
      setInstances(all);
    } catch {
      message.error('加载运行实例失败');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  // 每 5 秒轮询
  useEffect(() => {
    load(true);
    timerRef.current = setInterval(() => load(false), 5000);
    return () => clearInterval(timerRef.current);
  }, [load]);

  // 打开指标抽屉并轮询采样
  const openMetrics = (record: JobInstance) => {
    setMetricsInstance(record);
    setMetricsOpen(true);
  };

  useEffect(() => {
    if (!metricsOpen || !metricsInstance) return;
    let cancelled = false;
    const fetchMetrics = async () => {
      setMetricsLoading(true);
      try {
        const data = await getInstanceMetrics(metricsInstance.id);
        if (!cancelled) setMetrics(data);
      } catch {
        if (!cancelled) message.error('加载吞吐采样失败');
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    };
    fetchMetrics();
    const timer = setInterval(fetchMetrics, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [metricsOpen, metricsInstance]);

  const latestMetric = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  return (
    <Card styles={{ body: { paddingTop: 16 } }}>
      <PageHeader
        icon={<MonitorOutlined />}
        title="运行监控"
        subtitle="作业实例状态与实时吞吐，每 5 秒自动刷新"
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => load(true)}>
            刷新
          </Button>
        }
      />
      <Table<JobInstance>
        rowKey="id"
        loading={loading}
        dataSource={instances}
        pagination={{ pageSize: 10 }}
        locale={{ emptyText: <EmptyState description="暂无运行实例，到「作业管理」上线一个作业试试" /> }}
        rowClassName={(_, i) => (i % 2 === 1 ? 'sp-table-row-striped' : '')}
        columns={[
          { title: '实例ID', dataIndex: 'id', width: 90 },
          { title: '作业名', dataIndex: 'jobName' },
          { title: '作业版本', dataIndex: 'jobVersion', width: 90, render: (v: number) => `v${v}` },
          {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: (s: JobInstance['status']) => <StatusTag status={s} />,
          },
          {
            title: '累计处理行数',
            dataIndex: 'totalRows',
            width: 130,
            render: (v: number) => v?.toLocaleString(),
          },
          {
            title: '启动时间',
            dataIndex: 'startedAt',
            width: 170,
            render: (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'),
          },
          {
            title: '错误信息',
            dataIndex: 'errorMsg',
            ellipsis: true,
            render: (v?: string) => v || '-',
          },
          {
            title: '操作',
            width: 110,
            render: (_, record) => (
              <Button size="small" type="link" onClick={() => openMetrics(record)}>
                吞吐监控
              </Button>
            ),
          },
        ]}
      />

      <Drawer
        title={metricsInstance ? `吞吐采样：${metricsInstance.jobName}（实例 #${metricsInstance.id}）` : '吞吐采样'}
        open={metricsOpen}
        onClose={() => setMetricsOpen(false)}
        width={640}
      >
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <MetricCard
            title="当前吞吐"
            value={latestMetric?.rowsPerSec ?? 0}
            suffix="行/s"
            icon={<RiseOutlined />}
            gradient="linear-gradient(135deg, #2f54eb 0%, #5b8cff 100%)"
          />
          <MetricCard
            title="累计行数"
            value={latestMetric?.totalRows ?? metricsInstance?.totalRows ?? 0}
            icon={<DatabaseOutlined />}
            gradient="linear-gradient(135deg, #389e0d 0%, #6fce62 100%)"
          />
          <MetricCard
            title="最近采样"
            value={latestMetric ? dayjs(latestMetric.sampledAt).format('HH:mm:ss') : '-'}
            icon={<ClockCircleOutlined />}
            gradient="linear-gradient(135deg, #d46b08 0%, #ffa940 100%)"
          />
        </div>
        <MiniLineChart data={metrics.map((m) => m.rowsPerSec)} />
        <Table<JobMetric>
          style={{ marginTop: 16 }}
          rowKey="sampledAt"
          size="small"
          loading={metricsLoading && metrics.length === 0}
          dataSource={[...metrics].reverse()}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: '采样时间',
              dataIndex: 'sampledAt',
              render: (t: string) => dayjs(t).format('YYYY-MM-DD HH:mm:ss'),
            },
            { title: '吞吐（行/s）', dataIndex: 'rowsPerSec', render: (v: number) => v.toLocaleString() },
            { title: '累计行数', dataIndex: 'totalRows', render: (v: number) => v.toLocaleString() },
          ]}
        />
      </Drawer>
    </Card>
  );
}
