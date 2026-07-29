package com.sp.platform.components.postgresql;

import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.components.jdbc.AbstractJdbcSource;

/** PostgreSQL 输入控件：JDBC 流式读（逻辑见 {@link AbstractJdbcSource}）。 */
@ComponentDef(
        code = "postgresql-source",
        name = "PostgreSQL 输入",
        category = "SOURCE",
        description = "通过 JDBC 流式查询 PostgreSQL 数据",
        icon = "database",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["url", "username", "password", "sql"],
                  "properties": {
                    "url":       {"type": "string",  "title": "JDBC URL", "default": "jdbc:postgresql://localhost:5432/db"},
                    "username":  {"type": "string",  "title": "用户名"},
                    "password":  {"type": "string",  "title": "密码"},
                    "sql":       {"type": "string",  "title": "查询 SQL"},
                    "batchSize": {"type": "integer", "title": "批大小", "default": 5000}
                  }
                }
                """)
public class PostgresqlSource extends AbstractJdbcSource {

    @Override
    protected int fetchSize() {
        return 1000; // PG 驱动：autoCommit=false + 正数 fetchSize 即流式
    }
}
