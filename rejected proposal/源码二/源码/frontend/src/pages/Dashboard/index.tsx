/**
 * 仪表盘 — 统计数据来自 GET /api/dashboard/stats
 * 最近作业来自 GET /api/jobs；内置控件数来自 /api/components/built-in
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Col, Row, Statistic, Table, Tag, message } from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, InboxOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { dashboardApi, jobApi, componentApi } from '@/api'
import type { Job, JobStatus } from '@/types'

const statusMap: Record<JobStatus, { color: string; text: string }> = {
  draft: { color: 'default', text: '草稿' },
  online: { color: 'green', text: '运行中' },
  offline: { color: 'default', text: '已下线' },
  error: { color: 'red', text: '异常' },
}

interface Stats {
  total_jobs: number
  online_jobs: number
  total_executions: number
  success_executions: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentJobs, setRecentJobs] = useState<Job[]>([])
  const [componentCount, setComponentCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      dashboardApi.stats(),
      jobApi.list({ size: 5 }),
      componentApi.listBuiltIn(),
    ])
      .then(([statsRes, jobsRes, compsRes]) => {
        setStats(statsRes.data)
        setRecentJobs(jobsRes.data.records)
        setComponentCount(compsRes.data.length)
      })
      .catch(() => message.error('统计数据加载失败，请确认后端已启动'))
      .finally(() => setLoading(false))
  }, [])

  const failedExecs = stats ? stats.total_executions - stats.success_executions : 0

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="运行中作业" value={stats?.online_jobs ?? 0} prefix={<SyncOutlined />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="执行成功" value={stats?.success_executions ?? 0} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="执行失败" value={failedExecs} prefix={<CloseCircleOutlined />} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="内置控件" value={componentCount} prefix={<InboxOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title={`最近作业（共 ${stats?.total_jobs ?? 0} 个）`} style={{ marginTop: 16 }}>
        <Table
          dataSource={recentJobs}
          rowKey="id"
          loading={loading}
          pagination={false}
          columns={[
            {
              title: '作业名称', dataIndex: 'name',
              render: (text: string, record: Job) => (
                <a onClick={() => navigate(`/jobs/detail/${record.id}`)}>{text}</a>
              ),
            },
            {
              title: '状态', dataIndex: 'status', width: 120,
              render: (s: JobStatus) => <Tag color={statusMap[s]?.color}>{statusMap[s]?.text ?? s}</Tag>,
            },
            {
              title: '更新时间', dataIndex: 'updated_at', width: 180,
              render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
            },
          ]}
        />
      </Card>
    </div>
  )
}
