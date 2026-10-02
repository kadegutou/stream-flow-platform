package com.sp.platform.components.oracle;

import com.sp.platform.common.spi.ComponentDef;
import com.sp.platform.components.jdbc.AbstractJdbcSource;

/** Oracle 输入控件：JDBC 流式读（逻辑见 {@link AbstractJdbcSource}）。 */
@ComponentDef(
        code = "oracle-source",
        name = "Oracle 输入",
        category = "SOURCE",
        description = "通过 JDBC 流式查询 Oracle 数据",
        icon = "database",
        paramSchema = """
                {
                  "type": "object",
                  "required": ["url", "username", "sql"],
                  "properties": {
                    "url":       {"type": "string",  "title": "JDBC URL", "default": "jdbc:oracle:thin:@//localhost:1521/ORCL"},
                    "username":  {"type": "string",  "title": "用户名"},
                    "password":  {"type": "string",  "title": "密码"},
                    "sql":       {"type": "string",  "title": "查询 SQL"},
                    "shardColumn": {"type": "string", "title": "分片列（并行度>1 时必填）",
                                    "description": "数值型列名，如 id。并行度>1 时平台按该列取值区间切分数据；留空则拒绝并行"},
                    "batchSize": {"type": "integer", "title": "批大小", "default": 5000}
                  }
                }
                """)
public class OracleSource extends AbstractJdbcSource {

    @Override
    protected int fetchSize() {
        return 1000;
    }

    @Override
    protected boolean disableAutoCommit() {
        return false; // Oracle 只读查询无需关 autoCommit
    }
}
