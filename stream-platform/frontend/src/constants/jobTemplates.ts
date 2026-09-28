import type { Dag } from '../types';

/**
 * 示例作业模板：一键创建可直接上线的经典 DAG，用于快速体验与演示兜底。
 *
 * 参数按《部署文档》的约定环境填写（文件用容器视角 /data/...，MySQL 用容器内地址），
 * 载入后若与你的环境不符，进画布改对应节点的参数即可。
 */
export interface JobTemplate {
  key: string;
  name: string;
  description: string;
  parallelism: number;
  /** 链路摘要，展示在选择菜单里 */
  flow: string;
  dag: Dag;
}

const MYSQL_URL =
  'jdbc:mysql://mysql:3306/biz?useSSL=false&allowPublicKeyRetrieval=true&rewriteBatchedStatements=true';

export const JOB_TEMPLATES: JobTemplate[] = [
  {
    key: 'csv-concat',
    name: '示例：CSV 字段拼接导出',
    description: '读取 CSV，将 c1/c2/c3 三列拼接为新列 concat_col，写出到新 CSV。视频演示同款链路。',
    parallelism: 1,
    flow: 'CSV 输入 → 字段拼接 → CSV 输出',
    dag: {
      nodes: [
        {
          id: 'n1',
          componentCode: 'csv-source',
          params: { path: '/data/bench/in-100w.csv', hasHeader: true, batchSize: 5000 },
        },
        {
          id: 'n2',
          componentCode: 'field-concat',
          params: { sourceFields: ['c1', 'c2', 'c3'], targetField: 'concat_col', separator: '-' },
        },
        {
          id: 'n3',
          componentCode: 'csv-sink',
          params: { path: '/data/bench/demo-out.csv' },
        },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
      ],
    },
  },
  {
    key: 'fanout',
    name: '示例：扇出双写（CSV + MySQL）',
    description:
      '同一份数据同时写入 CSV 文件与 MySQL 表，演示多路转发扇出。上线前请先建好目标表（见画布节点参数）。',
    parallelism: 1,
    flow: 'CSV 输入 → 字段拼接 → 同时写 CSV + MySQL',
    dag: {
      nodes: [
        {
          id: 'n1',
          componentCode: 'csv-source',
          params: { path: '/data/bench/in-100w.csv', hasHeader: true, batchSize: 5000 },
        },
        {
          id: 'n2',
          componentCode: 'field-concat',
          params: { sourceFields: ['c1', 'c2', 'c3'], targetField: 'concat_col', separator: '-' },
        },
        {
          id: 'n3',
          componentCode: 'csv-sink',
          params: { path: '/data/bench/demo-fanout.csv' },
        },
        {
          id: 'n4',
          componentCode: 'mysql-sink',
          params: {
            url: MYSQL_URL,
            username: 'root',
            password: 'root123',
            table: 'demo_out',
            fields: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10', 'concat_col'],
          },
        },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
        { from: 'n2', to: 'n4' },
      ],
    },
  },
  {
    key: 'mysql-mask-kafka',
    name: '示例：MySQL 脱敏分发到 Kafka',
    description: '从 MySQL 读取订单表，字段改名 + 客户名中间打码后发往 Kafka，演示库表分发与敏感字段保护。',
    parallelism: 1,
    flow: 'MySQL 输入 → 字段映射 → 数据脱敏 → Kafka 输出',
    dag: {
      nodes: [
        {
          id: 'n1',
          componentCode: 'mysql-source',
          params: {
            url: MYSQL_URL,
            username: 'root',
            password: 'root123',
            sql: 'SELECT order_no, cust_name, amount FROM orders',
            batchSize: 5000,
          },
        },
        {
          id: 'n2',
          componentCode: 'field-map',
          params: { mapping: ['order_no:orderNo', 'cust_name:customer', 'amount:amt'] },
        },
        {
          id: 'n3',
          componentCode: 'data-mask',
          params: { rules: ['customer:mask-middle'] },
        },
        {
          id: 'n4',
          componentCode: 'kafka-sink',
          params: { bootstrapServers: 'kafka:29092', topic: 'orders-topic' },
        },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4' },
      ],
    },
  },
  {
    key: 'parallel-scale',
    name: '示例：并行度 4 横向扩展',
    description:
      '1000 万行 CSV，并行度 4。配合 `docker compose up -d --scale worker=3` 演示多 Worker 分摊；'
      + '输出为 4 个分片文件（.part0~part3）。注意：100 万行档并行收益被调度开销抵消，对比请用 1000 万行。',
    parallelism: 4,
    flow: 'CSV 输入(1000万) → 字段拼接 → CSV 输出（4 分片并行）',
    dag: {
      nodes: [
        {
          id: 'n1',
          componentCode: 'csv-source',
          params: { path: '/data/bench/in-1000w.csv', hasHeader: true, batchSize: 5000 },
        },
        {
          id: 'n2',
          componentCode: 'field-concat',
          params: { sourceFields: ['c1', 'c2', 'c3'], targetField: 'concat_col', separator: '-' },
        },
        {
          id: 'n3',
          componentCode: 'csv-sink',
          params: { path: '/data/bench/demo-p4-out.csv' },
        },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
      ],
    },
  },
  {
    key: 'bench-50m',
    name: '示例：5000 万行性能基准',
    description:
      '5000 万行 CSV（5.6GB），并行度 6。性能测试主场景，需 3 个 Worker 才能跑满；'
      + '输出为 6 个分片文件，行数校验应等于 5000 万 + 6 行表头。',
    parallelism: 6,
    flow: 'CSV 输入(5000万) → 字段拼接 → CSV 输出（6 分片并行）',
    dag: {
      nodes: [
        {
          id: 'n1',
          componentCode: 'csv-source',
          params: { path: '/data/bench/in-5000w.csv', hasHeader: true, batchSize: 5000 },
        },
        {
          id: 'n2',
          componentCode: 'field-concat',
          params: { sourceFields: ['c1', 'c2', 'c3'], targetField: 'concat_col', separator: '-' },
        },
        {
          id: 'n3',
          componentCode: 'csv-sink',
          params: { path: '/data/bench/bench-out-50m.csv' },
        },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
      ],
    },
  },
];
