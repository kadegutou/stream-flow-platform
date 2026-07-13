import { Card, Tabs, Table, Tag } from 'antd'
import { InputIcon, OutputIcon, ProcessIcon } from './ComponentIcons'

// 临时内联 SVG 图标
const InputIconComp = () => <Tag color="blue">输入</Tag>
const ProcessIconComp = () => <Tag color="orange">处理</Tag>
const OutputIconComp = () => <Tag color="green">输出</Tag>

const inputComponents = [
  { key: 'csv', name: 'CSV 输入', description: '读取 CSV 文件中的结构化数据', supports: '.csv' },
  { key: 'excel', name: 'Excel 输入', description: '读取 Excel 文件数据', supports: '.xlsx, .xls' },
  { key: 'mysql', name: 'MySQL 输入', description: '从 MySQL 数据库读取数据', supports: 'MySQL 8.x' },
  { key: 'kafka', name: 'Kafka 输入', description: '从 Kafka 消息队列消费数据', supports: '2.x+' },
]

const processComponents = [
  { key: 'xml2json', name: 'XML→JSON 转换', description: '将 XML 报文数据转换为 JSON 格式' },
  { key: 'json2xml', name: 'JSON→XML 转换', description: '将 JSON 数据转换为 XML 格式' },
  { key: 'concat', name: '字段拼接', description: '拼接 A、B 字段为新的 C 字段' },
]

const outputComponents = [
  { key: 'csv', name: 'CSV 输出', description: '将处理结果写入 CSV 文件' },
  { key: 'excel', name: 'Excel 输出', description: '将处理结果写入 Excel 文件' },
  { key: 'mysql', name: 'MySQL 输出', description: '将处理结果写入 MySQL 数据库' },
  { key: 'kafka', name: 'Kafka 输出', description: '将处理结果发送到 Kafka 消息队列' },
]

const columns = [
  { title: '控件名称', dataIndex: 'name', width: 150 },
  { title: '描述', dataIndex: 'description' },
  { title: '支持格式', dataIndex: 'supports' },
  {
    title: '操作', width: 80,
    render: () => <a>详情</a>,
  },
]

export default function ComponentList() {
  return (
    <Card title="控件管理">
      <Tabs
        items={[
          {
            key: 'input',
            label: <span><InputIconComp /> 输入控件</span>,
            children: <Table dataSource={inputComponents} rowKey="key" columns={columns} pagination={false} />,
          },
          {
            key: 'process',
            label: <span><ProcessIconComp /> 处理控件</span>,
            children: <Table dataSource={processComponents} rowKey="key" columns={columns} pagination={false} />,
          },
          {
            key: 'output',
            label: <span><OutputIconComp /> 输出控件</span>,
            children: <Table dataSource={outputComponents} rowKey="key" columns={columns} pagination={false} />,
          },
        ]}
      />
    </Card>
  )
}
