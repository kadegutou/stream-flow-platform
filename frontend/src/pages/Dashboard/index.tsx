import { Card, Col, Row, Statistic, Table, Tag } from 'antd'
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, InboxOutlined } from '@ant-design/icons'

const recentJobs = [
  { id: 1, name: 'CSV字段拼接输出', status: 'success', time: '2026-07-10 14:30' },
  { id: 2, name: 'Kafka→MySQL 同步', status: 'running', time: '2026-07-10 14:28' },
  { id: 3, name: 'XML转JSON作业', status: 'failed', time: '2026-07-10 14:25' },
]

const statusMap: Record<string, { color: string; icon: React.ReactNode; text: string }> = {
  success: { color: 'green', icon: <CheckCircleOutlined />, text: '成功' },
  running: { color: 'blue', icon: <SyncOutlined spin />, text: '运行中' },
  failed: { color: 'red', icon: <CloseCircleOutlined />, text: '失败' },
}

export default function Dashboard() {
  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic title="运行中作业" value={3} prefix={<SyncOutlined spin />} valueStyle={{ color: '#1677ff' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="今日完成" value={12} prefix={<CheckCircleOutlined />} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="失败作业" value={1} prefix={<CloseCircleOutlined />} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="控件总数" value={8} prefix={<InboxOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title="最近作业执行" style={{ marginTop: 16 }}>
        <Table
          dataSource={recentJobs}
          rowKey="id"
          pagination={false}
          columns={[
            { title: '作业名称', dataIndex: 'name' },
            {
              title: '状态', dataIndex: 'status',
              render: (s: string) => {
                const m = statusMap[s]
                return <Tag color={m.color} icon={m.icon}>{m.text}</Tag>
              },
            },
            { title: '执行时间', dataIndex: 'time' },
          ]}
        />
      </Card>
    </div>
  )
}
