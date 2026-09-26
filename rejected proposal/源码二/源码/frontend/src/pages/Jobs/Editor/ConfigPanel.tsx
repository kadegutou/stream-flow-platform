/**
 * 配置面板 — 选中画布节点后按 JSON Schema 动态渲染配置表单
 *
 *  1. 控件元数据来自 componentStore（/api/components/built-in）
 *  2. 按 schema 类型渲染: number→InputNumber / boolean→Switch / enum→Select
 *  3. 应用 schema default 默认值
 *  4. 修改表单时实时同步到节点的 data.config（经 editorStore）
 */

import { useEffect, useMemo, useCallback } from 'react'
import {
  Card, Form, Input, InputNumber, Select, Switch, Empty, Spin, Tag, Button, message,
} from 'antd'
import { useEditorStore } from '@/stores/editorStore'
import { useComponentStore } from '@/stores/componentStore'
import type { SchemaProperty } from '@/types'

// 路径、SQL、服务器列表等长文本用 TextArea
const LONG_TEXT_KEYS = ['path', 'query', 'bootstrap_servers']

export default function ConfigPanel() {
  const selectedNodeId = useEditorStore(s => s.selectedNodeId)
  const selectedNode = useEditorStore(s => s.nodes.find(n => n.id === s.selectedNodeId))
  const updateNodeConfig = useEditorStore(s => s.updateNodeConfig)

  const builtIn = useComponentStore(s => s.builtIn)
  const loading = useComponentStore(s => s.loading)
  const error = useComponentStore(s => s.error)
  const fetchBuiltIn = useComponentStore(s => s.fetchBuiltIn)

  const [form] = Form.useForm()

  useEffect(() => {
    if (builtIn.length === 0 && !loading && !error) fetchBuiltIn()
    if (error) message.error('控件列表加载失败，请确认后端已启动')
  }, [builtIn.length, loading, error, fetchBuiltIn])

  const componentName: string | undefined = selectedNode?.data?.componentName
  const currentSchema = useMemo(
    () => builtIn.find(s => s.name === componentName),
    [builtIn, componentName],
  )

  // 仅在切换选中节点时重置表单（默认值 + 已有配置），
  // 不依赖 config，避免 onValuesChange → store 更新 → setFieldsValue 的反馈循环
  useEffect(() => {
    if (!selectedNodeId || !selectedNode) {
      form.resetFields()
      return
    }
    const defaults: Record<string, unknown> = {}
    const props = currentSchema?.config_schema?.properties ?? {}
    for (const [key, prop] of Object.entries(props)) {
      if (prop.default !== undefined) defaults[key] = prop.default
    }
    form.setFieldsValue({ ...defaults, ...(selectedNode.data.config ?? {}) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, currentSchema, form])

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
  const renderField = (key: string, prop: SchemaProperty, required: boolean) => {
    const rules = required ? [{ required: true, message: `请填写${prop.title || key}` }] : []
    const label = prop.title || key

    if (prop.type === 'number' || prop.type === 'integer') {
      return (
        <Form.Item key={key} name={key} label={label} rules={rules}>
          <InputNumber style={{ width: '100%' }} precision={prop.type === 'integer' ? 0 : undefined} />
        </Form.Item>
      )
    }
    if (prop.type === 'boolean') {
      return (
        <Form.Item key={key} name={key} label={label} rules={rules} valuePropName="checked">
          <Switch />
        </Form.Item>
      )
    }
    if (prop.enum) {
      return (
        <Form.Item key={key} name={key} label={label} rules={rules}>
          <Select options={prop.enum.map(v => ({ label: String(v), value: v }))} />
        </Form.Item>
      )
    }
    return (
      <Form.Item key={key} name={key} label={label} rules={rules}>
        {LONG_TEXT_KEYS.includes(key) ? <Input.TextArea rows={2} /> : <Input />}
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

  // ── 加载失败 ──
  if (error) {
    return (
      <Card size="small" title="配置" style={{ height: '100%' }}>
        <Empty description="控件列表加载失败">
          <Button onClick={fetchBuiltIn}>重试</Button>
        </Empty>
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
