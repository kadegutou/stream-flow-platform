import { useParams } from 'react-router-dom'
import { Card, Descriptions, Tag, Timeline, Typography } from 'antd'

export default function JobDetail() {
  const { id } = useParams()

  return (
    <div>
      <Card title={`作业详情 #${id}`} style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="作业名称">CSV字段拼接输出</Descriptions.Item>
          <Descriptions.Item label="状态"><Tag color="green">运行中</Tag></Descriptions.Item>
          <Descriptions.Item label="描述">读取CSV，拼接A+B字段，写入新CSV</Descriptions.Item>
          <Descriptions.Item label="创建时间">2026-07-08</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="执行历史">
        <Timeline
          items={[
            { color: 'green', children: '2026-07-10 14:30:00 执行成功，处理 2,345 条' },
            { color: 'green', children: '2026-07-10 14:00:00 执行成功，处理 2,345 条' },
            { color: 'red', children: '2026-07-10 13:30:00 执行失败：文件未找到' },
            { color: 'green', children: '2026-07-10 13:00:00 执行成功，处理 2,345 条' },
          ]}
        />
      </Card>
    </div>
  )
}
