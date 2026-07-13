/**
 * 控件面板
 * 左侧可拖拽的控件库，按三类分组：输入 / 处理 / 输出
 */

import { Card, Input, Typography } from 'antd'
import {
  FileTextOutlined,
  DatabaseOutlined,
  ApiOutlined,
  SwapOutlined,
  MergeCellsOutlined,
  FileAddOutlined,
  GlobalOutlined,
} from '@ant-design/icons'

interface ComponentItem {
  type: string
  name: string
  icon: React.ReactNode
  color: string
}

const inputItems: ComponentItem[] = [
  { type: 'csv-input',   name: 'CSV 输入',   icon: <FileTextOutlined />, color: '#1677ff' },
  { type: 'excel-input', name: 'Excel 输入',  icon: <FileAddOutlined />,  color: '#1677ff' },
  { type: 'mysql-input', name: 'MySQL 输入',  icon: <DatabaseOutlined />, color: '#1677ff' },
  { type: 'kafka-input', name: 'Kafka 输入',  icon: <ApiOutlined />,      color: '#1677ff' },
]

const processItems: ComponentItem[] = [
  { type: 'xml2json',     name: 'XML → JSON',  icon: <SwapOutlined />,        color: '#fa8c16' },
  { type: 'json2xml',     name: 'JSON → XML',  icon: <SwapOutlined />,        color: '#fa8c16' },
  { type: 'concat',       name: '字段拼接',     icon: <MergeCellsOutlined />,  color: '#fa8c16' },
  { type: 'redis-enrich', name: 'Redis 扩充',  icon: <GlobalOutlined />,      color: '#fa8c16' },
]

const outputItems: ComponentItem[] = [
  { type: 'csv-output',   name: 'CSV 输出',   icon: <FileTextOutlined />, color: '#52c41a' },
  { type: 'excel-output', name: 'Excel 输出',  icon: <FileAddOutlined />,  color: '#52c41a' },
  { type: 'mysql-output', name: 'MySQL 输出',  icon: <DatabaseOutlined />, color: '#52c41a' },
  { type: 'kafka-output', name: 'Kafka 输出',  icon: <ApiOutlined />,      color: '#52c41a' },
]

function ItemRow({ item }: { item: ComponentItem }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/reactflow', item.type)
        e.dataTransfer.effectAllowed = 'move'
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 10px',
        marginBottom: 4,
        borderRadius: 6,
        cursor: 'grab',
        background: '#fafafa',
        border: '1px solid #f0f0f0',
        fontSize: 13,
        userSelect: 'none' as const,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = item.color + '15'
        e.currentTarget.style.borderColor = item.color
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = '#fafafa'
        e.currentTarget.style.borderColor = '#f0f0f0'
      }}
    >
      <span style={{ color: item.color, fontSize: 14 }}>{item.icon}</span>
      <span>{item.name}</span>
    </div>
  )
}

export default function ComponentPanel() {
  return (
    <Card
      size="small"
      title="控件库"
      styles={{ body: { padding: 8 } }}
      style={{ height: '100%', overflow: 'auto' }}
    >
      <Typography.Text strong style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 6 }}>
        📥 输入控件
      </Typography.Text>
      {inputItems.map(item => <ItemRow key={item.type} item={item} />)}

      <Typography.Text strong style={{ fontSize: 11, color: '#999', display: 'block', margin: '12px 0 6px' }}>
        ⚙️ 处理控件
      </Typography.Text>
      {processItems.map(item => <ItemRow key={item.type} item={item} />)}

      <Typography.Text strong style={{ fontSize: 11, color: '#999', display: 'block', margin: '12px 0 6px' }}>
        📤 输出控件
      </Typography.Text>
      {outputItems.map(item => <ItemRow key={item.type} item={item} />)}
    </Card>
  )
}
