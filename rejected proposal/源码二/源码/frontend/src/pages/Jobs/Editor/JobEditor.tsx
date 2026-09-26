/**
 * 作业编辑器 — 左侧控件库 / 中间画布 / 右侧配置
 *
 * 保存: nodes/edges 序列化为后端 dag_executor 期望的 dag_config (JSON 字符串)
 * 校验: 调用 POST /api/jobs/validate (Kahn 环检测 / 孤儿节点 / 缺输出)
 * 上线: Popconfirm 确认后调用 POST /api/jobs/:id/online
 */

import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Row, Col, Card, Button, Space, Typography, message, Popconfirm, Modal, Tag,
} from 'antd'
import { SaveOutlined, PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { ReactFlowProvider, type Node, type Edge } from 'reactflow'
import 'reactflow/dist/style.css'

import ComponentPanel from './ComponentPanel'
import FlowCanvas from './FlowCanvas'
import ConfigPanel from './ConfigPanel'
import { jobApi } from '@/api'
import { useEditorStore } from '@/stores/editorStore'
import { useComponentStore } from '@/stores/componentStore'
import type { DAGConfig, DAGNode, JobStatus } from '@/types'

const STATUS_LABEL: Record<JobStatus, { text: string; color: string }> = {
  draft: { text: '草稿', color: 'default' },
  online: { text: '运行中', color: 'green' },
  offline: { text: '已下线', color: 'orange' },
  error: { text: '异常', color: 'red' },
}

/** store 画布状态 → 后端 dag_config */
function serializeDag(nodes: Node[], edges: Edge[]): DAGConfig {
  return {
    nodes: nodes.map(n => ({
      id: n.id,
      component_name: n.data.componentName,
      position: n.position,
      config: n.data.config ?? {},
      data: { label: n.data.label },
    })),
    edges: edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
    })),
  }
}

export default function JobEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'

  const [jobName, setJobName] = useState('新建作业')
  const [jobStatus, setJobStatus] = useState<JobStatus>('draft')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchBuiltIn = useComponentStore(s => s.fetchBuiltIn)

  // 初始化: 拉取控件注册表 + 加载已有作业
  useEffect(() => {
    const { resetGraph, setGraph } = useEditorStore.getState()

    const init = async () => {
      await fetchBuiltIn()
      if (isNew) {
        resetGraph()
        return
      }
      setLoading(true)
      try {
        const res = await jobApi.get(Number(id))
        const job = res.data
        setJobName(job.name)
        setJobStatus(job.status)

        let dag: DAGConfig = { nodes: [], edges: [] }
        try {
          dag = job.dag_config ? JSON.parse(job.dag_config) : dag
        } catch {
          message.warning('作业 DAG 配置解析失败，已从空画布开始')
        }

        const getByName = useComponentStore.getState().getByName
        const nodes: Node[] = (dag.nodes || []).map((n: DAGNode) => {
          const meta = getByName(n.component_name)
          return {
            id: n.id,
            type: 'customNode',
            position: n.position ?? { x: 0, y: 0 },
            data: {
              label: n.data?.label || meta?.display_name || n.component_name,
              componentName: n.component_name,
              componentType: meta?.type ?? 'process',
              config: n.config ?? {},
            },
          }
        })
        const edges: Edge[] = (dag.edges || []).map(e => ({
          id: e.id || `e-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          animated: true,
        }))
        setGraph(nodes, edges)
      } catch {
        message.error('作业加载失败')
      } finally {
        setLoading(false)
      }
    }

    init()
    // 离开编辑器时清空画布，避免状态泄漏到下一个作业
    return () => useEditorStore.getState().resetGraph()
  }, [id, isNew, fetchBuiltIn])

  // ── 校验 ──
  const handleValidate = useCallback(async (): Promise<boolean> => {
    const { nodes, edges } = useEditorStore.getState()
    if (nodes.length === 0) {
      message.warning('画布为空，请先拖入控件')
      return false
    }
    try {
      const res = await jobApi.validate(serializeDag(nodes, edges))
      const result = res.data
      if (result.valid) {
        message.success(`校验通过：${result.node_count} 个节点，${result.edge_count} 条连线`)
        return true
      }
      Modal.error({
        title: 'DAG 校验未通过',
        content: (
          <ul style={{ paddingLeft: 18, marginBottom: 0 }}>
            {(result.errors || []).map((err, i) => <li key={i}>{err}</li>)}
          </ul>
        ),
      })
      return false
    } catch {
      message.error('校验请求失败，请确认后端已启动')
      return false
    }
  }, [])

  // ── 保存 ──
  const handleSave = useCallback(async (): Promise<number | null> => {
    if (!jobName.trim()) {
      message.warning('请填写作业名称')
      return null
    }
    const valid = await handleValidate()
    if (!valid) return null

    const { nodes, edges } = useEditorStore.getState()
    const dagConfig = JSON.stringify(serializeDag(nodes, edges))
    setSaving(true)
    try {
      if (isNew) {
        const res = await jobApi.create({ name: jobName.trim(), dag_config: dagConfig })
        message.success('作业已创建')
        navigate(`/jobs/editor/${res.data.id}`, { replace: true })
        return res.data.id
      }
      await jobApi.update(Number(id), { name: jobName.trim(), dag_config: dagConfig })
      message.success('作业已保存')
      return Number(id)
    } catch {
      message.error('保存失败，请确认后端已启动')
      return null
    } finally {
      setSaving(false)
    }
  }, [id, isNew, jobName, navigate, handleValidate])

  // ── 上线 ──
  const handleOnline = useCallback(async () => {
    // 新建作业先走保存流程拿到 id
    const jobId = isNew ? await handleSave() : Number(id)
    if (!jobId) return
    if (!isNew) {
      // 已有作业: 先保存当前画布，确保上线的是最新配置
      const saved = await handleSave()
      if (!saved) return
    }
    try {
      await jobApi.online(jobId)
      setJobStatus('online')
      message.success('作业已上线，引擎开始执行')
    } catch {
      message.error('上线失败')
    }
  }, [id, isNew, handleSave])

  const statusInfo = STATUS_LABEL[jobStatus]

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <Card size="small" style={{ marginBottom: 8 }} loading={loading}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Typography.Title
                level={5}
                style={{ margin: 0 }}
                editable={{ onChange: setJobName, triggerType: ['text', 'icon'] }}
              >
                {jobName}
              </Typography.Title>
              <Tag color={statusInfo.color}>{statusInfo.text}</Tag>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<CheckCircleOutlined />} onClick={handleValidate}>校验</Button>
              <Button icon={<SaveOutlined />} loading={saving} onClick={handleSave}>保存</Button>
              <Popconfirm
                title="上线作业"
                description="上线后引擎将立即开始持续执行，确认上线？"
                okText="上线"
                cancelText="取消"
                onConfirm={handleOnline}
              >
                <Button type="primary" icon={<PlayCircleOutlined />}>上线</Button>
              </Popconfirm>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 编辑器主体 */}
      <div style={{ flex: 1, display: 'flex', gap: 8, overflow: 'hidden' }}>
        {/* 左侧控件面板 */}
        <div style={{ width: 220, flexShrink: 0 }}>
          <ComponentPanel />
        </div>

        {/* 中间画布 */}
        <div style={{ flex: 1 }}>
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
        </div>

        {/* 右侧配置面板 */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <ConfigPanel />
        </div>
      </div>
    </div>
  )
}
