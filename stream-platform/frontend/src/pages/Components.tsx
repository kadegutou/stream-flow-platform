import { useEffect, useState } from 'react';
import { Card, Col, Collapse, Empty, message, Row, Typography } from 'antd';
import { listComponents } from '../api/components';
import type { ComponentDef, ComponentCategory } from '../types';
import { CategoryTag, CATEGORY_LABEL } from '../components/CategoryTag';

const CATEGORY_ORDER: ComponentCategory[] = ['SOURCE', 'PROCESS', 'SINK'];

export default function Components() {
  const [data, setData] = useState<ComponentDef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    listComponents()
      .then(setData)
      .catch(() => message.error('加载控件列表失败'))
      .finally(() => setLoading(false));
  }, []);

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: data.filter((c) => c.category === cat),
  }));

  return (
    <Card title="控件列表" loading={loading}>
      {!loading && data.length === 0 && <Empty description="暂无控件" />}
      {grouped.map(
        (group) =>
          group.items.length > 0 && (
            <div key={group.category} style={{ marginBottom: 24 }}>
              <Typography.Title level={5}>
                {group.category}（{CATEGORY_LABEL[group.category]}控件）
              </Typography.Title>
              <Row gutter={[16, 16]}>
                {group.items.map((comp) => (
                  <Col key={comp.id} xs={24} sm={12} md={8} lg={6}>
                    <Card
                      size="small"
                      title={
                        <span>
                          {comp.name}
                          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                            {comp.code}
                          </Typography.Text>
                        </span>
                      }
                    >
                      <div style={{ marginBottom: 8 }}>
                        <CategoryTag category={comp.category} />
                      </div>
                      <Typography.Paragraph
                        type="secondary"
                        style={{ fontSize: 12, minHeight: 40 }}
                        ellipsis={{ rows: 2 }}
                      >
                        {comp.description || '暂无描述'}
                      </Typography.Paragraph>
                      {comp.paramSchema && (
                        <Collapse
                          ghost
                          size="small"
                          items={[
                            {
                              key: 'schema',
                              label: '参数 Schema',
                              children: (
                                <pre style={{ fontSize: 12, maxHeight: 240, overflow: 'auto', margin: 0 }}>
                                  {JSON.stringify(comp.paramSchema, null, 2)}
                                </pre>
                              ),
                            },
                          ]}
                        />
                      )}
                    </Card>
                  </Col>
                ))}
              </Row>
            </div>
          ),
      )}
    </Card>
  );
}
