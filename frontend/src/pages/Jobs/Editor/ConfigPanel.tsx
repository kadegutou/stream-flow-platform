/**
 * 配置面板 — 选中画布节点后动态渲染配置表单
 *
 * 流程:
 *  1. 应用启动时从 GET /api/components/built-in 拉取所有控件的 config_schema
 *  2. 选中节点时，根据 componentName 查找对应 schema
 *  3. 根据 schema.properties 动态渲染 Form.Item
 *  4. 修改表单时实时同步到节点的 data.config
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, Form, Input, Empty, Spin, Typography, Tag } from 'antd'
import { componentApi } from '@/api'
import { useEditorStore } from '@/stores/editorStore'

interface ComponentMeta {
  name: string
  display_name: string
  type: string
  config_schema: {
    type: string
    properties: Record<string, { type: string; title: string; default?: unknown }>
    required?: string[]
  }
}

export default function ConfigPanel() {
  const selectedNodeId = useEditorStore(s => s.selectedNodeId)
  const componentName = useEditorStore(s => s.selectedComponentName)
  const config = useEditorStore(s => s.selectedConfig)
  const updateNodeConfig = useEditorStore(s => s.updateNodeConfig)
  const nodes = useEditorStore(s => s.nodes)

  const [schemas, setSchemas] = useState<ComponentMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm()

  // 启动时加载控件元信息
  useEffect(() => {
    componentApi
      .listBuiltIn()
      .then((res: any) => setSchemas(res.data || []))
      .catch(() => setSchemas([]))
      .finally(() => setLoading(false))
  }, [])

  // 选中节点变化 → 重置表单
  const selectedNode = nodes.find(n => n.id === selectedNodeId)
  const currentSchema = useMemo(
    () => schemas.find(s => s.name === componentName),
    [schemas, componentName],
  )

  useEffect(() => {
    if (config) {
      form.setFieldsValue(config)
    } else {
      form.resetFields()
    }
  }, [selectedNodeId, config, form])

  // 表单值变化 → 实时同步到节点
  const onValuesChange = useCallback(
    (_changed: Record<string, unknown>, allValues: Record<string, unknown>) => {
      if (selectedNodeId) {
        updateNodeConfig(selectedNodeId, allValues)
      }
    },
    [selectedNodeId, updateNodeConfig],
  )

  // 根据 JSON Schema 类型生成表单控件
  const renderField = (
    key: string,
    prop: { type: string; title: string; default?: unknown },
    required: boolean,
  ) => {
    const rules = required ? [{ required: true, message: `请输入${prop.title}` }] : []

    if (prop.type === 'string') {
      // 路径、SQL、Topic 等长文本用 TextArea
      const isLong = ['path', 'query', 'bootstrap_servers'].includes(key)
      return (
        <Form.Item key={key} name={key} label={prop.title} rules={rules}>
          {isLong ? <Input.TextArea rows={2} /> : <Input />}
        </Form.Item>
      )
    }

    // 数字、数组、对象等类型暂用纯文本输入
    return (
      <Form.Item key={key} name={key} label={prop.title} rules={rules}>
        <Input />
      </Form.Item>
    )
  }

  // ── 未选中节点 ──
  if (!selectedNodeId || !componentName) {
    return (
      <Card size="small" title="配置" style={{ height: '100%', overflow: 'auto' }}>
        <Empty description="选中画布中的控件以配置参数" />
      </Card>
    )
  }

  // ── 加载中 ──
  if (loading) {
    return (
      <Card size="small" title="配置" style={{ height: '100%' }}>
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
      </Card>
    )
  }

  // ── 未知控件 / 无 Schema ──
  if (!currentSchema?.config_schema?.properties) {
    return (
      <Card size="small" title={componentName} style={{ height: '100%', overflow: 'auto' }}>
        <Empty description={`控件 "${componentName}" 没有可配置项`} />
      </Card>
    )
  }

  // ── 渲染配置表单 ──
  const properties = currentSchema.config_schema.properties
  const required = currentSchema.config_schema.required || []
  const typeLabel = currentSchema.type === 'input' ? '输入' : currentSchema.type === 'process' ? '处理' : '输出'

  return (
    <Card
      size="small"
      title={
        <span>
          {currentSchema.display_name}
          <Tag style={{ marginLeft: 8 }} color={
            currentSchema.type === 'input' ? 'blue' : currentSchema.type === 'process' ? 'orange' : 'green'
          }>{typeLabel}</Tag>
        </span>
      }
      extra={<Typography.Text type="secondary" style={{ fontSize: 11 }}>id:{selectedNodeId}</Typography.Text>}
      style={{ height: '100%', overflow: 'auto' }}
    >
      <Form
        form={form}
        layout="vertical"
        size="small"
        onValuesChange={onValuesChange}
      >
        {Object.entries(properties).map(([key, prop]) =>
          renderField(key, prop, required.includes(key)),
        )}
      </Form>
    </Card>
  )
}
