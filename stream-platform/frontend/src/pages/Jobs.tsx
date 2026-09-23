import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Dropdown, Form, Input, InputNumber, Modal, Popconfirm, Segmented, Space, Table } from 'antd';
import { DownloadOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useRouteTransition } from '../components/RouteTransition';
import dayjs from 'dayjs';
import { createJob, deleteJob, listJobs, offlineJob, onlineJob } from '../api/jobs';
import { showApiError } from '../api/request';
import { appMessage } from '../utils/antdApp';
import type { Job } from '../types';
import { StatusTag } from '../components/StatusTag';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { JOB_TEMPLATES, type JobTemplate } from '../constants/jobTemplates';

export default function Jobs() {
  const { transitionTo } = useRouteTransition();
  const [data, setData] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const [form] = Form.useForm<{ name: string; description?: string; parallelism: number }>();

  // 搜索 + 状态筛选
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return data.filter((j) => {
      if (kw && !j.name.toLowerCase().includes(kw) && !(j.description ?? '').toLowerCase().includes(kw)) {
        return false;
      }
      if (statusFilter === 'ALL') return true;
      if (statusFilter === 'NONE') return !j.runningStatus;
      return j.runningStatus === statusFilter;
    });
  }, [data, keyword, statusFilter]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await listJobs());
    } catch (e) {
      showApiError(e, '加载作业列表失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 组件卸载后不再回调，避免延迟刷新打到已卸载的组件上
  useEffect(() => () => clearTimeout(refreshTimerRef.current), []);

  /**
   * 上线/下线只负责把状态推进到 PENDING/STOPPING，最终态由调度器在 5s 内收敛。
   * 立即刷一次让用户看到状态已变，再静默补刷一次让状态落到 RUNNING/STOPPED。
   */
  const refreshAfterStateChange = useCallback(() => {
    load();
    clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => load(true), 3000);
  }, [load]);

  const onCreate = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      // 创建作业不传 dag（空草稿），进画布编排保存时才提交 DAG
      await createJob(values);
      appMessage().success('作业已创建，请进入画布编排');
      setModalOpen(false);
      load();
    } catch (e) {
      showApiError(e, '创建失败');
    } finally {
      setSaving(false);
    }
  };

  /** 一键载入示例模板：直接带 DAG 创建作业，省去现场编排 */
  const onLoadTemplate = async (tpl: JobTemplate) => {
    setSaving(true);
    try {
      await createJob({
        name: tpl.name,
        description: tpl.description,
        parallelism: tpl.parallelism,
        dag: tpl.dag,
      });
      appMessage().success(`已载入「${tpl.name}」，可直接上线或进画布调整参数`);
      load();
    } catch (e) {
      showApiError(e, '载入示例失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id: number) => {
    try {
      await deleteJob(id);
      appMessage().success('已删除');
      load();
    } catch (e) {
      showApiError(e, '删除失败');
    }
  };

  const onOnline = async (id: number) => {
    try {
      await onlineJob(id);
      appMessage().success('已发起上线，实例状态将在数秒内收敛');
      refreshAfterStateChange();
    } catch (e) {
      showApiError(e, '上线失败');
    }
  };

  const onOffline = async (id: number) => {
    try {
      await offlineJob(id);
      appMessage().success('已发起下线，在途批次处理完即退出');
      refreshAfterStateChange();
    } catch (e) {
      showApiError(e, '下线失败');
    }
  };

  return (
    <Card styles={{ body: { paddingTop: 16 } }}>
      <PageHeader
        icon={<UnorderedListOutlined />}
        title="作业管理"
        subtitle="拖拽编排数据流作业，一键上线持续处理"
        extra={
          <Space>
            <Dropdown
              trigger={['click']}
              menu={{
                items: JOB_TEMPLATES.map((t) => ({
                  key: t.key,
                  label: (
                    <div style={{ maxWidth: 340, padding: '2px 0' }}>
                      <div style={{ fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>{t.flow}</div>
                    </div>
                  ),
                  onClick: () => onLoadTemplate(t),
                })),
              }}
            >
              <Button icon={<DownloadOutlined />} loading={saving}>
                载入示例
              </Button>
            </Dropdown>
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
          </Space>
        }
      />
      <Space style={{ marginBottom: 12 }} wrap>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#b6bdd0' }} />}
          placeholder="搜索作业名称 / 描述"
          style={{ width: 240 }}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <Segmented
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          options={[
            { value: 'ALL', label: '全部' },
            { value: 'RUNNING', label: '运行中' },
            { value: 'STOPPED', label: '已停止' },
            { value: 'FAILED', label: '失败' },
            { value: 'NONE', label: '未上线' },
          ]}
        />
      </Space>
      <Table<Job>
        rowKey="id"
        loading={loading}
        dataSource={filtered}
        locale={{
          emptyText: (
            <EmptyState description="还没有作业：点右上角「新建作业」从零编排，或用「载入示例」一键体验完整链路" />
          ),
        }}
        rowClassName={(_, i) => (i % 2 === 1 ? 'sp-table-row-striped' : '')}
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
                <Button size="small" type="link" onClick={() => transitionTo(`/jobs/${record.id}/editor`)}>
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
