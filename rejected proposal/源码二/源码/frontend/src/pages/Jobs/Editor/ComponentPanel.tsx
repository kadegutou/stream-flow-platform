/**
 * 控件面板 — 左侧可拖拽的控件库，按三类分组：输入 / 处理 / 输出
 * 数据来自 componentStore（后端 /api/components/built-in），不再硬编码
 */

import { useEffect } from 'react'
import { Card, Typography, Spin, Empty, Button } from 'antd'
import {
  ImportOutlined,
  SwapOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { useComponentStore } from '@/stores/componentStore'
import type { BuiltInComponent, ComponentType } from '@/types'

const GROUPS: { type: ComponentType; title: string; icon: React.ReactNode; color: string }[] = [
  { type: 'input', title: '📥 输入控件', icon: <ImportOutlined />, color: '#1677ff' },
  { type: 'process', title: '⚙️ 处理控件', icon: <SwapOutlined />, color: '#fa8c16' },
  { type: 'output', title: '📤 输出控件', icon: <ExportOutlined />, color: '#52c41a' },
]

function ItemRow({ item, icon, color }: { item: BuiltInComponent; icon: React.ReactNode; color: string }) {
  return (
    <div
      className="component-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/reactflow', item.name)
        e.dataTransfer.effectAllowed = 'move'
      }}
    >
      <span style={{ color, fontSize: 14 }}>{icon}</span>
      <span>{item.display_name}</span>
    </div>
  )
}

export default function ComponentPanel() {
  const builtIn = useComponentStore(s => s.builtIn)
  const loading = useComponentStore(s => s.loading)
  const error = useComponentStore(s => s.error)
  const fetchBuiltIn = useComponentStore(s => s.fetchBuiltIn)

  useEffect(() => {
    fetchBuiltIn()
  }, [fetchBuiltIn])

  let body: React.ReactNode
  if (loading) {
    body = <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  } else if (error) {
    body = (
      <Empty description="控件加载失败">
        <Button size="small" onClick={fetchBuiltIn}>重试</Button>
      </Empty>
    )
  } else {
    body = (
      <>
        {GROUPS.map(group => {
          const items = builtIn.filter(c => c.type === group.type)
          if (items.length === 0) return null
          return (
            <div key={group.type}>
              <Typography.Text
                strong
                style={{ fontSize: 11, color: '#999', display: 'block', margin: '12px 0 6px' }}
              >
                {group.title}
              </Typography.Text>
              {items.map(item => (
                <ItemRow key={item.name} item={item} icon={group.icon} color={group.color} />
              ))}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <Card
      size="small"
      title="控件库"
      styles={{ body: { padding: 8 } }}
      style={{ height: '100%', overflow: 'auto' }}
    >
      {body}
    </Card>
  )
}
