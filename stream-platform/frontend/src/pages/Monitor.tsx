import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Drawer, Space, Table, Typography } from 'antd';
import { ReloadOutlined, RiseOutlined, DatabaseOutlined, ClockCircleOutlined, MonitorOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { listJobs } from '../api/jobs';
import { getInstanceMetrics, listJobInstances } from '../api/instances';
import { ApiError, showApiError } from '../api/request';
import type { JobInstance, JobMetric } from '../types';
import { StatusTag } from '../components/StatusTag';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { useThemeStore } from '../store/theme';
import { palette } from '../theme/palette';

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
        color: '#fff', // 渐变卡恒为深色底，白字固定
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
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
        {suffix && <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 6, opacity: 0.85 }}>{suffix}</span>}
      </div>
    </div>
  );
}

/**
 * 简单 SVG 迷你折线图（不引重型图表库）：渐变面积填充 + 明暗自适应。
 * 用 viewBox 自适应容器宽度——原先固定 width=560，抽屉在窄屏或字号放大后会横向溢出；
 * 同时补上首尾时间刻度与采样点数，否则整张图只有"峰值"一行字，更像插画而不是图表。
 */
function MiniLineChart({
  data,
  times = [],
  height = 170,
}: {
  data: number[];
  times?: string[];
  height?: number;
}) {
  const dark = useThemeStore((s) => s.dark);
  const p = palette(dark);
  if (data.length === 0) {
    return <Typography.Text type="secondary">暂无采样数据</Typography.Text>;
  }
  const W = 560;
  const max = Math.max(...data, 1);
  const padX = 18;
  const padTop = 22;
  const padBottom = 28; // 给底部时间刻度留位置
  const stepX = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0;
  const yOf = (v: number) => height - padBottom - (v / max) * (height - padTop - padBottom);
  const pts = data.map((v, i) => [padX + i * stepX, yOf(v)] as const);
  const points = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // 折线下方围出的面积，用于渐变填充
  const lastX = pts.length > 1 ? pts[pts.length - 1][0] : padX;
  const areaPath = `M ${padX},${height - padBottom} L ${points.replace(/ /g, ' L ')} L ${lastX},${height - padBottom} Z`;

  const line = p.accent;
  const axis = dark ? `rgba(${p.whiteRgb},.07)` : `rgba(${p.inkRgb},.07)`;
  // 原 #98a0b0 在白底只有 2.54:1，投影后基本看不清（现走 textSubtle）
  const label = p.textSubtle;
  const firstTime = times[0] ? dayjs(times[0]).format('HH:mm:ss') : null;
  const lastTime = times.length > 1 ? dayjs(times[times.length - 1]).format('HH:mm:ss') : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      role="img"
      aria-label={`吞吐折线图：峰值 ${max.toLocaleString()} 行/秒，共 ${data.length} 个采样点`}
      style={{
        width: '100%',
        height: 'auto',
        background: p.chart,
        borderRadius: 10,
        display: 'block',
      }}
    >
      <defs>
        <linearGradient id="sp-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={line} stopOpacity={dark ? 0.35 : 0.22} />
          <stop offset="100%" stopColor={line} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* 三条水平参考线 */}
      {[0.25, 0.5, 0.75].map((r) => (
        <line
          key={r}
          x1={padX}
          x2={W - padX}
          y1={padTop + r * (height - padTop - padBottom)}
          y2={padTop + r * (height - padTop - padBottom)}
          stroke={axis}
          strokeDasharray="3 5"
        />
      ))}
      <path d={areaPath} fill="url(#sp-chart-fill)" stroke="none" />
      <polyline points={points} fill="none" stroke={line} strokeWidth={2} strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={line} stroke={p.chart} strokeWidth={1.5} />
      ))}
      <text x={padX} y={14} fontSize={11} fill={label}>
        峰值 {max.toLocaleString()} 行/s
      </text>
      <text x={W - padX} y={14} fontSize={11} fill={label} textAnchor="end">
        {data.length} 个采样点
      </text>
      {firstTime && (
        <text x={padX} y={height - 8} fontSize={11} fill={label}>
          {firstTime}
        </text>
      )}
      {lastTime && (
        <text x={W - padX} y={height - 8} fontSize={11} fill={label} textAnchor="end">
          {lastTime}
        </text>
      )}
    </svg>
  );
}

export default function Monitor() {
  const dark = useThemeStore((s) => s.dark);
  const p = palette(dark);
  const [instances, setInstances] = useState<JobInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [metricsInstance, setMetricsInstance] = useState<JobInstance | null>(null);
  const [metrics, setMetrics] = useState<JobMetric[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const inFlightRef = useRef(false);

  // 汇总所有作业的实例（无全局实例接口，按作业聚合）
  const load = useCallback(async (showLoading = false) => {
    // 后台轮询：上一轮还没回来就跳过本轮，避免慢查询时请求叠加
    if (!showLoading && inFlightRef.current) return;
    inFlightRef.current = true;
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
      setLastUpdated(new Date());
      setConnectionIssue(null);
    } catch (e) {
      // 手动刷新/首次加载失败才弹提示；后台轮询失败只更新页头状态位，
      // 否则后端一抖动就会每 5s 弹一次错误提示刷屏
      setConnectionIssue(e instanceof ApiError ? e.message : '无法连接服务器');
      if (showLoading) {
        showApiError(e, '加载运行实例失败');
      }
    } finally {
      inFlightRef.current = false;
      if (showLoading) setLoading(false);
    }
  }, []);

  // 每 5 秒轮询；标签页切到后台时暂停，切回前台立即补一次
  useEffect(() => {
    load(true);
    timerRef.current = setInterval(() => {
      if (document.hidden) return;
      load(false);
    }, 5000);
    const onVisibilityChange = () => {
      if (!document.hidden) load(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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
      } catch (e) {
        if (!cancelled) showApiError(e, '加载吞吐采样失败');
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
          <Space>
            {connectionIssue ? (
              <Typography.Text type="warning" style={{ fontSize: 12 }}>
                自动刷新中断（{connectionIssue}），正在按 5 秒重试
              </Typography.Text>
            ) : lastUpdated ? (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                最后更新 {dayjs(lastUpdated).format('HH:mm:ss')}（5s 自动刷新）
              </Typography.Text>
            ) : null}
            <Button icon={<ReloadOutlined />} onClick={() => load(true)}>
              刷新
            </Button>
          </Space>
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
            gradient={p.accentGradient}
          />
          <MetricCard
            title="累计行数"
            value={latestMetric?.totalRows ?? metricsInstance?.totalRows ?? 0}
            icon={<DatabaseOutlined />}
            // 指标卡渐变是恒定的深色底（不随明暗切换），保留字面量
            gradient="linear-gradient(135deg, #389e0d 0%, #6fce62 100%)"
          />
          <MetricCard
            title="最近采样"
            value={latestMetric ? dayjs(latestMetric.sampledAt).format('HH:mm:ss') : '-'}
            icon={<ClockCircleOutlined />}
            gradient="linear-gradient(135deg, #d46b08 0%, #ffa940 100%)"
          />
        </div>
        <MiniLineChart data={metrics.map((m) => m.rowsPerSec)} times={metrics.map((m) => m.sampledAt)} />
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
