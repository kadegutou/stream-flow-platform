/**
 * 作业管理 — 接 GET /api/jobs + 上线/下线开关 + 删除
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Space, Button, Switch, message, Popconfirm } from 'antd'
import { PlusOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { jobApi } from '@/api'
import type { Job, JobStatus } from '@/types'

const statusColorMap: Record<JobStatus, string> = {
  draft: 'default', online: 'green', offline: 'default', error: 'red',
}
const statusTextMap: Record<JobStatus, string> = {
  draft: '草稿', online: '运行中', offline: '已下线', error: '异常',
}

export default function JobList() {
  const navigate = useNavigate()
  const [data, setData] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)

  const fetchJobs = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const res = await jobApi.list({ page: p, size: 10 })
      setData(res.data.records)
      setTotal(res.data.total)
    } catch {
      message.error('作业列表加载失败，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchJobs(page)
  }, [page, fetchJobs])

  // 上线 / 下线
  const handleToggle = async (job: Job, checked: boolean) => {
    setTogglingId(job.id)
    try {
      if (checked) {
        await jobApi.online(job.id)
        message.success(`作业「${job.name}」已上线`)
      } else {
        await jobApi.offline(job.id)
        message.info(`作业「${job.name}」已下线`)
      }
      fetchJobs()
    } catch {
      message.error('操作失败')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (job: Job) => {
    try {
      await jobApi.delete(job.id)
      message.success(`作业「${job.name}」已删除`)
      fetchJobs()
    } catch {
      message.error('删除失败')
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    {
      title: '作业名称', dataIndex: 'name',
      render: (text: string, record: Job) => (
        <a onClick={() => navigate(`/jobs/detail/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: '描述', dataIndex: 'description',
      render: (v: string) => v || '-',
    },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s: JobStatus) => <Tag color={statusColorMap[s]}>{statusTextMap[s]}</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 160,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作', width: 240,
      render: (_: unknown, record: Job) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/jobs/editor/${record.id}`)}>编辑</Button>
          <Popconfirm
            title="删除作业"
            description={`确认删除作业「${record.name}」？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <Button size="small" danger>删除</Button>
          </Popconfirm>
          <Switch
            size="small"
            checked={record.status === 'online'}
            loading={togglingId === record.id}
            onChange={(checked) => handleToggle(record, checked)}
            checkedChildren={<PlayCircleOutlined />}
            unCheckedChildren={<StopOutlined />}
          />
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="作业管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/jobs/editor/new')}>
          新建作业
        </Button>
      }
    >
      <Table
        dataSource={data}
        rowKey="id"
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: setPage,
          showTotal: t => `共 ${t} 条`,
        }}
      />
    </Card>
  )
}
