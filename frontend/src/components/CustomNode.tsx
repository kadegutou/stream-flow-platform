/**
 * 自定义 ReactFlow 节点 — 参考 VibeETL 的 CustomNode
 *
 * 特性:
 *  - 输入控件: 仅右侧输出接口
 *  - 处理控件: 左侧输入 + 右侧输出
 *  - 输出控件: 仅左侧输入接口
 *  - 状态指示灯 (idle / running / success / error)
 *  - 配置摘要展示
 */

import { memo } from 'react'
import { Handle, Position } from 'reactflow'
import {
  FileTextOutlined,
  DatabaseOutlined,
  ApiOutlined,
  SwapOutlined,
  MergeCellsOutlined,
  FileAddOutlined,
  CodeOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'

interface CustomNodeProps {
  id: string
  data: {
    label: string
    componentName?: string
    status?: 'idle' | 'running' | 'success' | 'error'
    config?: Record<string, unknown>
    rows?: number
  }
  selected: boolean
  type: string
}

const iconMap: Record<string, React.ReactNode> = {
  'csv-input': <FileTextOutlined />,
  'excel-input': <FileAddOutlined />,
  'mysql-input': <DatabaseOutlined />,
  'kafka-input': <ApiOutlined />,
  'xml2json': <SwapOutlined />,
  'json2xml': <SwapOutlined />,
  'concat': <MergeCellsOutlined />,
  'redis-enrich': <CodeOutlined />,
  'csv-output': <FileTextOutlined />,
  'excel-output': <FileAddOutlined />,
  'mysql-output': <DatabaseOutlined />,
  'kafka-output': <ApiOutlined />,
}

const colorMap: Record<string, string> = {
  input: '#1677ff',
  process: '#fa8c16',
  output: '#52c41a',
}

function getCategory(componentName: string): string {
  if (componentName.endsWith('-input')) return 'input'
  if (componentName.endsWith('-output')) return 'output'
  return 'process'
}

function getConfigSummary(componentName: string, config?: Record<string, unknown>): string {
  if (!config) return ''
  if (config.path) return String(config.path).split('/').pop() || ''
  if (config.table) return `表: ${config.table}`
  if (config.topic) return `Topic: ${config.topic}`
  if (config.field_a && config.field_b) return `${config.field_a} + ${config.field_b} → ${config.field_c || 'C'}`
  return ''
}

function CustomNode({ id, data, selected, type }: CustomNodeProps) {
  const componentName = data.componentName || ''
  const category = getCategory(componentName)
  const borderColor = colorMap[category] || '#d9d9d9'
  const summary = getConfigSummary(componentName, data.config)
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
        <>
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
          <div
            style={{
              position: 'absolute',
              left: -22,
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: 9,
              color: '#999',
              pointerEvents: 'none',
            }}
          />
        </>
      )}

      {/* 节点 ID 标签 */}
      <div style={{ fontSize: 9, color: '#bbb', marginBottom: 4, textAlign: 'center' }}>
        [id:{id}]
      </div>

      {/* 图标 + 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <span style={{ color: borderColor, fontSize: 16 }}>
          {iconMap[componentName] || <SwapOutlined />}
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
