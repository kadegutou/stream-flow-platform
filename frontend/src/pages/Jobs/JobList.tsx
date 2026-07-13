import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Table, Tag, Space, Button, Switch, message } from 'antd'
import { PlusOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'

interface Job {
  id: number
  name: string
  description: string
  status: 'draft' | 'online' | 'offline' | 'error'
  created_at: string
}

const mockJobs: Job[] = [
  { id: 1, name: 'CSV字段拼接输出', description: '读取CSV，拼接A+B字段，写入新CSV', status: 'online', created_at: '2026-07-08' },
  { id: 2, name: 'Kafka→MySQL同步', description: '消费Kafka消息，写入MySQL', status: 'offline', created_at: '2026-07-09' },
  { id: 3, name: 'XML转JSON并输出', description: '读取XML文件，转为JSON，写入MySQL', status: 'draft', created_at: '2026-07-10' },
]

const statusColorMap: Record<string, string> = {
  draft: 'default', online: 'green', offline: 'grey', error: 'red',
}
const statusTextMap: Record<string, string> = {
  draft: '草稿', online: '运行中', offline: '已下线', error: '异常',
}

export default function JobList() {
  const navigate = useNavigate()
  const [data] = useState(mockJobs)

  const handleToggle = (job: Job, checked: boolean) => {
    if (checked) {
      message.success(`作业「${job.name}」已上线`)
    } else {
      message.info(`作业「${job.name}」已下线`)
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: '作业名称', dataIndex: 'name', render: (text: string, record: Job) => <a onClick={() => navigate(`/jobs/detail/${record.id}`)}>{text}</a> },
    { title: '描述', dataIndex: 'description' },
    { title: '状态', dataIndex: 'status', width: 100,
      render: (s: string) => <Tag color={statusColorMap[s]}>{statusTextMap[s]}</Tag>,
    },
    { title: '创建时间', dataIndex: 'created_at', width: 120 },
    {
      title: '操作', width: 220,
      render: (_: unknown, record: Job) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/jobs/editor/${record.id}`)}>编辑</Button>
          <Switch
            size="small"
            checked={record.status === 'online'}
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
      <Table dataSource={data} rowKey="id" columns={columns} />
    </Card>
  )
}
