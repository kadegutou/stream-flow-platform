package com.sp.platform.components.mysql;

import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.components.jdbc.AbstractJdbcSink;

/** MySQL 输出控件：JDBC batch insert（逻辑见 {@link AbstractJdbcSink}）。 */
@ComponentDef(
        code = "mysql-sink",
        name = "MySQL 输出",
        category = "SINK",
        description = "通过 JDBC 批量插入 MySQL 表",
        icon = "database",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["url", "username", "password", "table", "fields"],
                  "properties": {
                    "url":      {"type": "string", "title": "JDBC URL"},
                    "username": {"type": "string", "title": "用户名"},
                    "password": {"type": "string", "title": "密码"},
                    "table":    {"type": "string", "title": "目标表"},
                    "fields":   {"type": "array",  "title": "字段列表", "items": {"type": "string"}}
                  }
                }
                """)
public class MysqlSink extends AbstractJdbcSink {

    @Override
    protected String identifierQuote() {
        return "`";
    }
}
