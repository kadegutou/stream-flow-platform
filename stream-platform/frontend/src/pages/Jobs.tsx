import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { createJob, deleteJob, listJobs, offlineJob, onlineJob } from '../api/jobs';
import type { Job } from '../types';
import { StatusTag } from '../components/StatusTag';

export default function Jobs() {
  const navigate = useNavigate();
  const [data, setData] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string; description?: string; parallelism: number }>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listJobs());
    } catch {
      message.error('加载作业列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      // 创建作业不传 dag（空草稿），进画布编排保存时才提交 DAG
      await createJob(values);
      message.success('作业已创建，请进入画布编排');
      setModalOpen(false);
      load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '创建失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteJob(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const onOnline = async (id: number) => {
    try {
      await onlineJob(id);
      message.success('已发起上线');
      load();
    } catch {
      message.error('上线失败');
    }
  };

  const onOffline = async (id: number) => {
    try {
      await offlineJob(id);
      message.success('已发起下线');
      load();
    } catch {
      message.error('下线失败');
    }
  };

  return (
    <Card
      title="作业管理"
      extra={
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ parallelism: 1 });
            setModalOpen(true);
          }}
        >
          新建作业
        </Button>
      }
    >
      <Table<Job>
        rowKey="id"
        loading={loading}
        dataSource={data}
        columns={[
          { title: 'ID', dataIndex: 'id', width: 70 },
          { title: '名称', dataIndex: 'name' },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          { title: '版本', dataIndex: 'version', width: 80, render: (v: number) => `v${v}` },
          { title: '并行度', dataIndex: 'parallelism', width: 80 },
          {
            title: '更新时间',
            dataIndex: 'updatedAt',
            width: 170,
            render: (t?: string) => (t ? dayjs(t).format('YYYY-MM-DD HH:mm:ss') : '-'),
          },
          {
            title: '运行状态',
            dataIndex: 'runningStatus',
            width: 100,
            render: (s: Job['runningStatus']) => <StatusTag status={s} />,
          },
          {
            title: '操作',
            width: 280,
            render: (_, record) => (
              <Space wrap>
                <Button size="small" type="link" onClick={() => navigate(`/jobs/${record.id}/editor`)}>
                  编辑画布
                </Button>
                <Popconfirm title="确认上线该作业？" onConfirm={() => onOnline(record.id)}>
                  <Button size="small" type="link">
                    上线
                  </Button>
                </Popconfirm>
                <Popconfirm title="确认下线该作业？" onConfirm={() => onOffline(record.id)}>
                  <Button size="small" type="link" danger>
                    下线
                  </Button>
                </Popconfirm>
                <Popconfirm title="确认删除该作业？" onConfirm={() => onDelete(record.id)}>
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
        title="新建作业"
        open={modalOpen}
        onOk={onCreate}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ parallelism: 1 }}>
          <Form.Item name="name" label="作业名称" rules={[{ required: true, message: '请输入作业名称' }]}>
            <Input placeholder="例如：CSV 导入 MySQL" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="作业用途说明（可选）" />
          </Form.Item>
          <Form.Item name="parallelism" label="并行度" rules={[{ required: true, message: '请输入并行度' }]}>
            <InputNumber min={1} max={64} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
