import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Input, message, Modal, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { createUser, deleteUser, listUsers, updateUser, type UserPayload } from '../api/users';
import type { User } from '../types';

export default function Users() {
  const [data, setData] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<UserPayload>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listUsers());
    } catch {
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ role: 'USER', status: 1 });
    setModalOpen(true);
  };

  const openEdit = (record: User) => {
    setEditing(record);
    form.setFieldsValue({
      username: record.username,
      nickname: record.nickname,
      role: record.role,
      status: record.status,
      password: undefined,
    });
    setModalOpen(true);
  };

  const onOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updateUser(editing.id, values);
        message.success('用户已更新');
      } else {
        await createUser(values);
        message.success('用户已创建');
      }
      setModalOpen(false);
      load();
    } catch {
      message.error(editing ? '更新失败' : '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteUser(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  return (
    <Card
      title="用户管理"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新增用户
        </Button>
      }
    >
      <Table<User>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '用户名', dataIndex: 'username' },
          { title: '昵称', dataIndex: 'nickname' },
          {
            title: '角色',
            dataIndex: 'role',
            render: (role: User['role']) =>
              role === 'ADMIN' ? <Tag color="purple">管理员</Tag> : <Tag>普通用户</Tag>,
          },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: number) =>
              status === 1 ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag>,
          },
          {
            title: '操作',
            width: 160,
            render: (_, record) => (
              <Space>
                <Button size="small" type="link" onClick={() => openEdit(record)}>
                  编辑
                </Button>
                <Popconfirm title="确认删除该用户？" onConfirm={() => onDelete(record.id)}>
                  <Button size="small" type="link" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑用户' : '新增用户'}
        open={modalOpen}
        onOk={onOk}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input disabled={!!editing} placeholder="登录用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={editing ? [] : [{ required: true, message: '请输入密码' }]}
            extra={editing ? '留空表示不修改密码' : undefined}
          >
            <Input.Password placeholder={editing ? '留空不修改' : '登录密码'} autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="显示名称" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'ADMIN', label: '管理员' },
                { value: 'USER', label: '普通用户' },
              ]}
            />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 1, label: '启用' },
                { value: 0, label: '禁用' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
