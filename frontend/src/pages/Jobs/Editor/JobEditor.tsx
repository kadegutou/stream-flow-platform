import { useState, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import {
  Row, Col, Card, Button, Space, Typography, message,
} from 'antd'
import { SaveOutlined, PlayCircleOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons'
import {
  ReactFlowProvider,
} from 'reactflow'
import 'reactflow/dist/style.css'

import ComponentPanel from './ComponentPanel'
import FlowCanvas from './FlowCanvas'
import ConfigPanel from './ConfigPanel'

export default function JobEditor() {
  const { id } = useParams()
  const isNew = id === 'new'
  const [jobName, setJobName] = useState(isNew ? '新建作业' : `作业 #${id}`)

  const handleSave = () => message.success('作业已保存')
  const handleOnline = () => message.success('作业已上线')
  const handleValidate = () => message.info('校验通过')

  return (
    <div style={{ height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
      {/* 顶栏 */}
      <Card size="small" style={{ marginBottom: 8 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Typography.Title level={5} style={{ margin: 0 }}>{jobName}</Typography.Title>
              <Typography.Text type="secondary">{isNew ? '新建草稿' : '编辑模式'}</Typography.Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<CheckCircleOutlined />} onClick={handleValidate}>校验</Button>
              <Button icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleOnline}>上线</Button>
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
