import { Form, Input, InputNumber, Select, Switch, Typography } from 'antd';
import type { ParamSchema } from '../types';

/**
 * 按控件的 JSON Schema 动态渲染参数表单项。
 * 只覆盖前端渲染需要的子集：enum→Select、array(string)→tags、boolean→Switch、
 * number/integer→InputNumber、其余→Input。从 JobEditor 抽出，便于复用与单测渲染。
 */
export function ParamFormItems({ schema }: { schema?: ParamSchema }) {
  const properties = schema?.properties ?? {};
  const required = schema?.required ?? [];
  const entries = Object.entries(properties);

  if (entries.length === 0) {
    return <Typography.Text type="secondary">该控件无需配置参数</Typography.Text>;
  }

  return (
    <>
      {entries.map(([key, prop]) => {
        const label = prop.title || key;
        const rules = required.includes(key) ? [{ required: true, message: `请填写${label}` }] : [];

        // enum → Select
        if (prop.enum && prop.enum.length > 0) {
          return (
            <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
              <Select
                allowClear
                options={prop.enum.map((v) => ({ value: v, label: String(v) }))}
                placeholder="请选择"
              />
            </Form.Item>
          );
        }
        // array(string) → Select tags
        if (prop.type === 'array' && (!prop.items?.type || prop.items.type === 'string')) {
          return (
            <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
              <Select mode="tags" open={false} placeholder="输入后回车添加" suffixIcon={null} />
            </Form.Item>
          );
        }
        // boolean → Switch
        if (prop.type === 'boolean') {
          return (
            <Form.Item
              key={key}
              name={key}
              label={label}
              rules={rules}
              tooltip={prop.description}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          );
        }
        // number / integer → InputNumber
        if (prop.type === 'number' || prop.type === 'integer') {
          return (
            <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
              <InputNumber style={{ width: '100%' }} precision={prop.type === 'integer' ? 0 : undefined} />
            </Form.Item>
          );
        }
        // string / 其他 → Input
        return (
          <Form.Item key={key} name={key} label={label} rules={rules} tooltip={prop.description}>
            <Input placeholder={prop.description || label} />
          </Form.Item>
        );
      })}
    </>
  );
}
