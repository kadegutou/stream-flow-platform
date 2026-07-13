import { useState } from 'react'
import { Card, Table, Button, Modal, Form, Input, Space, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'

interface User {
  id: number
  username: string
  email: string
  role: string
  created_at: string
}

const mockUsers: User[] = [
  { id: 1, username: 'admin', email: 'admin@bangsheng.com', role: 'admin', created_at: '2026-07-01' },
  { id: 2, username: 'dev1', email: 'dev1@bangsheng.com', role: 'user', created_at: '2026-07-05' },
]

export default function UserList() {
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '用户名', dataIndex: 'username' },
    { title: '邮箱', dataIndex: 'email' },
    { title: '角色', dataIndex: 'role' },
    { title: '创建时间', dataIndex: 'created_at' },
    {
      title: '操作', width: 150,
      render: () => (
        <Space>
          <a>编辑</a>
          <a style={{ color: '#ff4d4f' }}>删除</a>
        </Space>
      ),
    },
  ]

  const handleCreate = () => {
    form.validateFields().then(values => {
      console.log(values)
      message.success('用户创建成功')
      setModalOpen(false)
      form.resetFields()
    })
  }

  return (
    <Card title="用户管理" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>新增用户</Button>}>
      <Table dataSource={mockUsers} rowKey="id" columns={columns} />

      <Modal title="新增用户" open={modalOpen} onOk={handleCreate} onCancel={() => setModalOpen(false)}>
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
