import { Card, Typography, Empty } from 'antd'

export default function ConfigPanel() {
  return (
    <Card size="small" title="配置" style={{ height: '100%', overflow: 'auto' }}>
      <Empty description="选中画布中的控件以配置参数" />
    </Card>
  )
}
