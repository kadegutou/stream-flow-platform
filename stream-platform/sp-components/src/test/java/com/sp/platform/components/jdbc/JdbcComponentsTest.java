package com.sp.platform.components.jdbc;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** JDBC 抽象基类 round-trip：H2 内存库，Sink 批量写入 → Source 流式读回。 */
class JdbcComponentsTest {

    // DATABASE_TO_UPPER=false：让未加引号的标识符保持原样，与 PG/Oracle 的小写表名语义一致，
    // 否则 H2 默认大写化建表名，而 AbstractJdbc* 用双引号引用精确小写名会找不到表
    private static final String URL = "jdbc:h2:mem:jdbctest;DB_CLOSE_DELAY=-1;DATABASE_TO_UPPER=false";

    /** 用 H2 验证基类逻辑：fetchSize 正数、双引号标识符。 */
    static class H2Source extends AbstractJdbcSource {
        @Override
        protected int fetchSize() {
            return 100;
        }
    }

    static class H2Sink extends AbstractJdbcSink {
        @Override
        protected String identifierQuote() {
            return "\"";
        }
    }

    @Test
    void writeThenReadRoundTrip() throws Exception {
        try (Connection c = DriverManager.getConnection(URL, "sa", "");
             var st = c.createStatement()) {
            st.execute("CREATE TABLE IF NOT EXISTS person (id VARCHAR(16), name VARCHAR(64))");
            st.execute("DELETE FROM person");
        }

        H2Sink sink = new H2Sink();
        sink.open(Map.of("url", URL, "username", "sa", "password", "",
                "table", "person", "fields", List.of("id", "name")), Context.single());
        List<Row> rows = new ArrayList<>();
        for (int i = 1; i <= 120; i++) {
            Map<String, Object> f = new LinkedHashMap<>();
            f.put("id", "id" + i);
            f.put("name", "n" + i);
            rows.add(new Row(f));
        }
        sink.write(rows.subList(0, 70));
        sink.write(rows.subList(70, 120));
        sink.close();

        H2Source source = new H2Source();
        source.open(Map.of("url", URL, "username", "sa", "password", "",
                "sql", "SELECT id, name FROM person ORDER BY id", "batchSize", 50),
                Context.single());
        List<Row> all = new ArrayList<>();
        List<Row> batch;
        while (!(batch = source.poll()).isEmpty()) {
            all.addAll(batch);
        }
        source.close();

        assertEquals(120, all.size());
        assertEquals("id1", all.get(0).getString("id"));
        assertEquals("n1", all.get(0).getString("name"));
    }
}
