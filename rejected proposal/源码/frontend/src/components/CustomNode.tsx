/**
 * 自定义 ReactFlow 节点
 *
 *  - 输入控件: 仅右侧输出接口
 *  - 处理控件: 左侧输入 + 右侧输出
 *  - 输出控件: 仅左侧输入接口
 *  - 状态指示灯 (idle / running / success / error)
 *  - 配置摘要展示
 *
 * 类别/图标/颜色由 data.componentType 决定（来自后端注册表），
 * 不再按控件名后缀猜测。
 */

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import {
  ImportOutlined,
  SwapOutlined,
  ExportOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import type { ComponentType } from '@/types'

interface CustomNodeProps {
  data: {
    label: string
    componentName?: string
    componentType?: ComponentType
    status?: 'idle' | 'running' | 'success' | 'error'
    config?: Record<string, unknown>
    rows?: number
  }
  selected: boolean
}

const iconMap: Record<ComponentType, React.ReactNode> = {
  input: <ImportOutlined />,
  process: <SwapOutlined />,
  output: <ExportOutlined />,
}

const colorMap: Record<ComponentType, string> = {
  input: '#1677ff',
  process: '#fa8c16',
  output: '#52c41a',
}

function getConfigSummary(config?: Record<string, unknown>): string {
  if (!config) return ''
  if (config.path) return String(config.path).split('/').pop() || ''
  if (config.table) return `表: ${config.table}`
  if (config.topic) return `Topic: ${config.topic}`
  if (config.field_a && config.field_b) return `${config.field_a} + ${config.field_b} → ${config.field_c || 'C'}`
  return ''
}

function CustomNode({ data, selected }: CustomNodeProps) {
  const category: ComponentType = data.componentType || 'process'
  const borderColor = colorMap[category]
  const summary = getConfigSummary(data.config)
  const isInput = category === 'input'
  const isOutput = category === 'output'
  const status = data.status || 'idle'

  return (
    <div
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: `2px solid ${selected ? '#1677ff' : borderColor}`,
        background: '#fff',
        minWidth: 140,
        boxShadow: selected
          ? '0 4px 12px rgba(22, 119, 255, 0.3)'
          : '0 2px 6px rgba(0,0,0,0.08)',
        position: 'relative',
      }}
    >
      {/* 输入接口 — 输入控件不显示 */}
      {!isInput && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{
            width: 10, height: 10,
            border: `2px solid ${borderColor}`,
            background: '#fff',
          }}
        />
      )}

      {/* 图标 + 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <span style={{ color: borderColor, fontSize: 16 }}>
          {iconMap[category]}
        </span>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#333' }}>
          {data.label}
        </span>
      </div>

      {/* 配置摘要 */}
      {summary && (
        <div
          style={{
            fontSize: 10,
            color: '#999',
            textAlign: 'center',
            marginTop: 4,
            maxWidth: 120,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={summary}
        >
          {summary}
        </div>
      )}

      {/* 状态指示器 */}
      {status === 'running' && (
        <div style={{ position: 'absolute', top: -8, right: -8 }}>
          <LoadingOutlined style={{ color: '#1677ff', fontSize: 14 }} spin />
        </div>
      )}
      {status === 'success' && (
        <div style={{ position: 'absolute', top: -8, right: -8 }}>
          <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
        </div>
      )}
      {status === 'error' && (
        <div style={{ position: 'absolute', top: -8, right: -8 }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
        </div>
      )}

      {/* 行数展示 */}
      {data.rows !== undefined && status === 'success' && (
        <div style={{ fontSize: 10, color: '#52c41a', textAlign: 'center', marginTop: 2 }}>
          {data.rows} 行
        </div>
      )}

      {/* 输出接口 — 输出控件不显示 */}
      {!isOutput && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{
            width: 10, height: 10,
            border: `2px solid ${borderColor}`,
            background: '#fff',
          }}
        />
      )}
    </div>
  )
}

export default memo(CustomNode)
