/**
 * 作业详情 — 接 GET /api/jobs/:id + GET /api/jobs/:id/executions
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Descriptions, Tag, Timeline, Button, message, Empty } from 'antd'
import { ArrowLeftOutlined, EditOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { jobApi } from '@/api'
import type { Job, JobStatus, Execution } from '@/types'

const statusColorMap: Record<JobStatus, string> = {
  draft: 'default', online: 'green', offline: 'default', error: 'red',
}
const statusTextMap: Record<JobStatus, string> = {
  draft: '草稿', online: '运行中', offline: '已下线', error: '异常',
}

const execColorMap: Record<string, string> = {
  success: 'green', failed: 'red', running: 'blue',
}

function fmt(t?: string | null) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState<Job | null>(null)
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([jobApi.get(Number(id)), jobApi.executions(Number(id))])
      .then(([jobRes, execRes]) => {
        setJob(jobRes.data)
        setExecutions(execRes.data || [])
      })
      .catch(() => message.error('作业详情加载失败'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div>
      <Card
        title={job ? `作业详情：${job.name}` : '作业详情'}
        loading={loading}
        style={{ marginBottom: 16 }}
        extra={
          <Button icon={<EditOutlined />} onClick={() => navigate(`/jobs/editor/${id}`)}>
            编辑
          </Button>
        }
      >
        {job && (
          <Descriptions column={2}>
            <Descriptions.Item label="作业名称">{job.name}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={statusColorMap[job.status]}>{statusTextMap[job.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="描述">{job.description || '-'}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{fmt(job.created_at)}</Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card
        title={`执行历史（${executions.length} 条）`}
        extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/jobs')}>返回列表</Button>}
      >
        {executions.length === 0 ? (
          <Empty description="还没有执行记录，上线作业后开始执行" />
        ) : (
          <Timeline
            items={executions.map(e => ({
              color: execColorMap[e.status] || 'gray',
              children: (
                <>
                  {fmt(e.started_at)}
                  {e.status === 'success' && ` 执行成功，处理 ${e.rows_processed} 行`}
                  {e.status === 'failed' && ` 执行失败${e.error_msg ? `：${e.error_msg}` : ''}`}
                  {e.status === 'running' && ' 执行中…'}
                </>
              ),
            }))}
          />
        )}
      </Card>
    </div>
  )
}
