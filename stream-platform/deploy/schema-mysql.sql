-- 通用流处理任务管理平台 MySQL 建库建表脚本（prod profile）
-- 按《数据库设计说明书》§2 字段定义；表名统一加 sp_ 前缀（与 JPA Entity 一致），
-- JSON 大字段使用 MySQL JSON 类型。字符集 utf8mb4，引擎 InnoDB。

CREATE DATABASE IF NOT EXISTS stream_platform
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE stream_platform;

-- 用户表（设计文档 sys_user）
CREATE TABLE IF NOT EXISTS sp_sys_user (
  id            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '用户 ID',
  username      VARCHAR(64)  NOT NULL COMMENT '登录名',
  password_hash VARCHAR(128) NOT NULL COMMENT 'BCrypt 加密存储',
  nickname      VARCHAR(64)  NULL COMMENT '显示名',
  role          VARCHAR(16)  NOT NULL DEFAULT 'USER' COMMENT 'ADMIN / USER',
  status        TINYINT      NOT NULL DEFAULT 1 COMMENT '1 启用 0 禁用',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE = InnoDB COMMENT = '用户表';

-- 控件注册表（设计文档 component_def）
CREATE TABLE IF NOT EXISTS sp_component_def (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64)  NOT NULL COMMENT '控件编码，如 csv-source',
  name         VARCHAR(64)  NOT NULL COMMENT '显示名',
  category     VARCHAR(16)  NOT NULL COMMENT 'SOURCE / PROCESS / SINK',
  description  VARCHAR(512) NULL,
  icon         VARCHAR(64)  NULL,
  param_schema JSON         NOT NULL COMMENT '参数 JSON Schema',
  impl_class   VARCHAR(256) NOT NULL COMMENT '实现类全限定名',
  builtin      TINYINT      NOT NULL DEFAULT 1 COMMENT '1 内置 0 自定义',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_code (code),
  KEY idx_category (category)
) ENGINE = InnoDB COMMENT = '控件注册表';

-- 作业表（设计文档 job）
CREATE TABLE IF NOT EXISTS sp_job (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  name        VARCHAR(128) NOT NULL,
  description VARCHAR(512) NULL,
  dag_json    JSON         NOT NULL COMMENT 'DAG 定义（nodes + edges）',
  version     INT          NOT NULL DEFAULT 1,
  parallelism INT          NOT NULL DEFAULT 1,
  owner_id    BIGINT       NOT NULL COMMENT '创建人',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_owner (owner_id)
) ENGINE = InnoDB COMMENT = '作业表';

-- 作业运行实例表（设计文档 job_instance）
CREATE TABLE IF NOT EXISTS sp_job_instance (
  id           BIGINT   NOT NULL AUTO_INCREMENT,
  job_id       BIGINT   NOT NULL,
  job_version  INT      NOT NULL COMMENT '上线时的作业版本快照号',
  dag_snapshot JSON     NOT NULL COMMENT '上线时 DAG 快照',
  status       VARCHAR(16) NOT NULL COMMENT 'PENDING/RUNNING/STOPPING/STOPPED/FAILED',
  total_rows   BIGINT   NOT NULL DEFAULT 0,
  error_msg    TEXT     NULL,
  started_at   DATETIME NULL,
  stopped_at   DATETIME NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_job (job_id),
  KEY idx_status (status)
) ENGINE = InnoDB COMMENT = '作业运行实例表';

-- 作业分片表（设计文档 job_shard）
CREATE TABLE IF NOT EXISTS sp_job_shard (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  instance_id BIGINT       NOT NULL,
  shard_index INT          NOT NULL COMMENT '分片序号 0..N-1',
  shard_key   VARCHAR(256) NULL COMMENT '分片键（Kafka 分区号、文件偏移区间）',
  worker_id   BIGINT       NULL COMMENT '指派的 Worker，未分配为 NULL',
  status      VARCHAR(16)  NOT NULL COMMENT 'PENDING/RUNNING/STOPPING/STOPPED/FAILED',
  total_rows  BIGINT       NOT NULL DEFAULT 0,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_instance_shard (instance_id, shard_index),
  KEY idx_worker_status (worker_id, status)
) ENGINE = InnoDB COMMENT = '作业分片表';

-- Worker 节点表（设计文档 worker_node）
CREATE TABLE IF NOT EXISTS sp_worker_node (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  node_code      VARCHAR(64)  NOT NULL COMMENT 'hostname-pid 或容器名',
  address        VARCHAR(128) NOT NULL COMMENT 'host:port',
  status         VARCHAR(16)  NOT NULL COMMENT 'ONLINE / OFFLINE',
  last_heartbeat DATETIME     NOT NULL,
  registered_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_node_code (node_code)
) ENGINE = InnoDB COMMENT = 'Worker 节点表';

-- 作业吞吐采样表（设计文档 job_metric）
CREATE TABLE IF NOT EXISTS sp_job_metric (
  id           BIGINT   NOT NULL AUTO_INCREMENT,
  instance_id  BIGINT   NOT NULL,
  rows_per_sec BIGINT   NOT NULL,
  total_rows   BIGINT   NOT NULL,
  sampled_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_instance_time (instance_id, sampled_at)
) ENGINE = InnoDB COMMENT = '作业吞吐采样表';

-- 初始管理员 admin/admin123 由控制面启动时自动初始化（Bootstrap），此处不重复插入。
