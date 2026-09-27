/**
 * 用户管理 — 接 GET/POST/PUT/DELETE /api/users
 * 列表分页 + 新增/编辑弹窗 + 删除二次确认
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Card, Table, Button, Modal, Form, Input, Space, message, Popconfirm, Tag,
} from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { userApi } from '@/api'
import type { User } from '@/types'

export default function UserList() {
  const [data, setData] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  const fetchUsers = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const res = await userApi.list({ page: p, size: 10 })
      setData(res.data.records)
      setTotal(res.data.total)
    } catch {
      message.error('用户列表加载失败，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchUsers(page)
  }, [page, fetchUsers])

  // 打开新增 / 编辑弹窗
  const openModal = (user: User | null) => {
    setEditingUser(user)
    form.resetFields()
    if (user) form.setFieldsValue({ username: user.username, email: user.email })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    setSubmitting(true)
    try {
      if (editingUser) {
        // 密码留空 = 不修改
        if (!values.password) delete values.password
        await userApi.update(editingUser.id, values)
        message.success('用户已更新')
      } else {
        await userApi.create(values)
        message.success('用户创建成功')
      }
      setModalOpen(false)
      fetchUsers()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (user: User) => {
    try {
      await userApi.delete(user.id)
      message.success(`用户「${user.username}」已删除`)
      fetchUsers()
    } catch {
      message.error('删除失败')
    }
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 80 },
    { title: '用户名', dataIndex: 'username' },
    { title: '邮箱', dataIndex: 'email', render: (v: string) => v || '-' },
    {
      title: '角色', dataIndex: 'role', width: 100,
      render: (r: string) => <Tag color={r === 'admin' ? 'gold' : 'default'}>{r}</Tag>,
    },
    {
      title: '创建时间', dataIndex: 'created_at', width: 170,
      render: (t: string) => t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-',
    },
    {
      title: '操作', width: 150,
      render: (_: unknown, record: User) => (
        <Space>
          <a onClick={() => openModal(record)}>编辑</a>
          <Popconfirm
            title="删除用户"
            description={`确认删除用户「${record.username}」？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(record)}
          >
            <a style={{ color: '#ff4d4f' }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="用户管理"
      extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null)}>新增用户</Button>}
    >
      <Table
        dataSource={data}
        rowKey="id"
        columns={columns}
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 10,
          onChange: setPage,
          showTotal: t => `共 ${t} 条`,
        }}
      />

      <Modal
        title={editingUser ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={editingUser ? '密码（留空则不修改）' : '密码'}
            rules={editingUser ? [] : [{ required: true, message: '请输入密码' }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}
