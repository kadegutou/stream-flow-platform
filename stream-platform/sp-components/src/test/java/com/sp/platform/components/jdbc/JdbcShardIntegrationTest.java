package com.sp.platform.components.jdbc;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * JDBC 源并行分片的真库验证：用 H2（test 依赖）起真实数据库、执行真实 SQL，
 * 逐分片读取后断言「各分片行数之和 == 总行数」且「并集 == 全量」——即不重不漏。
 *
 * <p>覆盖的边界：密集自增键的负载均衡、分片列含 NULL、分片列全为 NULL、空表、
 * 分片数多于行数、非数值分片列报错、并行度=1 时不要求分片列（向后兼容）。
 */
class JdbcShardIntegrationTest {

    private static final String URL = "jdbc:h2:mem:jdbcshard;DB_CLOSE_DELAY=-1;MODE=MySQL";

    /** 主表行数：4 个分片时每片恰好 5000 行。 */
    private static final int ROWS = 20_000;

    @BeforeAll
    static void setUp() throws Exception {
        try (Connection c = DriverManager.getConnection(URL, "sa", "")) {
            try (Statement s = c.createStatement()) {
                s.execute("CREATE TABLE t (id BIGINT PRIMARY KEY, name VARCHAR(64))");
                s.execute("CREATE TABLE tn (id BIGINT PRIMARY KEY, grp BIGINT)");
                s.execute("CREATE TABLE tallnull (id BIGINT PRIMARY KEY, grp BIGINT)");
                s.execute("CREATE TABLE tempty (id BIGINT PRIMARY KEY, grp BIGINT)");
                s.execute("CREATE TABLE tsmall (id BIGINT PRIMARY KEY, name VARCHAR(64))");
                s.execute("CREATE TABLE tstr (id BIGINT PRIMARY KEY, name VARCHAR(64))");
            }
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO t (id, name) VALUES (?, ?)")) {
                for (int i = 1; i <= ROWS; i++) {
                    ps.setLong(1, i);
                    ps.setString(2, "n" + i);
                    ps.addBatch();
                    if (i % 5000 == 0) {
                        ps.executeBatch();
                    }
                }
                ps.executeBatch();
            }
            // 奇数行 grp = id，偶数行 grp 为 NULL → 验证 NULL 行不会静默丢失
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO tn (id, grp) VALUES (?, ?)")) {
                for (int i = 1; i <= 1000; i++) {
                    ps.setLong(1, i);
                    if (i % 2 == 1) {
                        ps.setLong(2, i);
                    } else {
                        ps.setNull(2, Types.BIGINT);
                    }
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO tallnull (id, grp) VALUES (?, ?)")) {
                for (int i = 1; i <= 100; i++) {
                    ps.setLong(1, i);
                    ps.setNull(2, Types.BIGINT);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO tsmall (id, name) VALUES (?, ?)")) {
                for (int i = 1; i <= 3; i++) {
                    ps.setLong(1, i);
                    ps.setString(2, "s" + i);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
            try (PreparedStatement ps = c.prepareStatement("INSERT INTO tstr (id, name) VALUES (?, ?)")) {
                ps.setLong(1, 1L);
                ps.setString(2, "alpha");
                ps.addBatch();
                ps.setLong(1, 2L);
                ps.setString(2, "beta");
                ps.addBatch();
                ps.executeBatch();
            }
            c.commit();
        }
    }

    @Test
    void fourShardsCoverAllRowsExactlyOnceAndStayBalanced() throws Exception {
        List<String> full = readField("SELECT id, name FROM t", null, 0, 1, "id");
        assertEquals(ROWS, full.size(), "并行度=1 时应读到全量");

        int sum = 0;
        Set<String> merged = new HashSet<>();
        for (int i = 0; i < 4; i++) {
            List<String> part = readField("SELECT id, name FROM t", "id", i, 4, "id");
            assertEquals(ROWS / 4, part.size(), "密集自增键下各分片负载应均衡（分片 " + i + "）");
            sum += part.size();
            merged.addAll(part);
        }
        assertEquals(ROWS, sum, "各分片行数之和必须等于总行数——多了就是重复");
        assertEquals(new HashSet<>(full), merged, "并集必须等于全量——少了就是丢失");
    }

    @Test
    void nullShardValuesGoToFirstShardAndAreNeverLost() throws Exception {
        List<String> full = readField("SELECT id, grp FROM tn", null, 0, 1, "grp");
        long nullCount = full.stream().filter("NULL"::equals).count();
        assertEquals(500, nullCount, "前置条件：表里应有 500 行 grp 为 NULL");

        int sum = 0;
        Set<String> merged = new HashSet<>();
        List<String> firstShard = null;
        for (int i = 0; i < 3; i++) {
            List<String> part = readField("SELECT id, grp FROM tn", "grp", i, 3, "grp");
            if (i == 0) {
                firstShard = part;
            }
            sum += part.size();
            merged.addAll(part);
        }
        assertEquals(full.size(), sum, "NULL 行与任何区间比较都为 UNKNOWN，若无人承接就会静默丢失");
        assertEquals(new HashSet<>(full), merged);
        assertEquals(nullCount, firstShard.stream().filter("NULL"::equals).count(),
                "分片列为 NULL 的行必须由首分片承接");
    }

    @Test
    void allNullShardColumnFallsBackToFirstShard() throws Exception {
        assertEquals(100, readField("SELECT id, grp FROM tallnull", "grp", 0, 3, "id").size());
        assertEquals(0, readField("SELECT id, grp FROM tallnull", "grp", 1, 3, "id").size());
        assertEquals(0, readField("SELECT id, grp FROM tallnull", "grp", 2, 3, "id").size());
    }

    @Test
    void emptyTableProducesNoRowsOnEveryShard() throws Exception {
        for (int i = 0; i < 3; i++) {
            assertTrue(readField("SELECT id, grp FROM tempty", "grp", i, 3, "id").isEmpty());
        }
    }

    @Test
    void moreShardsThanRowsStillCoversEverythingExactlyOnce() throws Exception {
        int sum = 0;
        Set<String> merged = new HashSet<>();
        for (int i = 0; i < 4; i++) {
            List<String> part = readField("SELECT id, name FROM tsmall", "id", i, 4, "id");
            sum += part.size();
            merged.addAll(part);
        }
        assertEquals(3, sum);
        assertEquals(Set.of("1", "2", "3"), merged);
    }

    @Test
    void parallelismOneDoesNotRequireShardColumn() throws Exception {
        // 向后兼容：并行度=1 时走原路径，不要求分片列、不改写 SQL
        assertEquals(ROWS, readField("SELECT id, name FROM t", null, 0, 1, "id").size());
        assertEquals(ROWS, readField("SELECT id, name FROM t", "  ", 0, 1, "id").size());
    }

    @Test
    void nonNumericShardColumnFailsWithActionableMessage() {
        Exception e = assertThrows(Exception.class,
                () -> readField("SELECT id, name FROM tstr", "name", 0, 2, "id"));
        assertTrue(String.valueOf(e.getMessage()).contains("分片列"),
                "报错应点明是分片列的问题: " + e.getMessage());
    }

    @Test
    void shardColumnMissingFromResultSetFailsWithActionableMessage() {
        Exception e = assertThrows(Exception.class,
                () -> readField("SELECT id FROM t", "name", 0, 2, "id"));
        assertTrue(String.valueOf(e.getMessage()).contains("分片列"),
                "报错应点明是分片列的问题: " + e.getMessage());
    }

    // ==================== 测试脚手架 ====================

    /** 读取单个分片指定字段的全部值；字段为 NULL 时以 "NULL" 占位，便于断言。 */
    private static List<String> readField(String sql, String shardColumn,
                                          int shardIndex, int totalShards, String field)
            throws Exception {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("url", URL);
        params.put("username", "sa");
        params.put("password", "");
        params.put("sql", sql);
        params.put("batchSize", 500);
        if (shardColumn != null) {
            params.put("shardColumn", shardColumn);
        }
        params.put("shardIndex", shardIndex);
        params.put("totalShards", totalShards);

        AbstractJdbcSource source = new H2Source();
        source.open(params, new Context(shardIndex, null, totalShards));
        try {
            List<String> values = new ArrayList<>();
            List<Row> batch;
            while (!(batch = source.poll()).isEmpty()) {
                for (Row row : batch) {
                    values.add(fieldValue(row.fields(), field));
                }
            }
            return values;
        } finally {
            source.close();
        }
    }

    /**
     * 取字段值，NULL 以 "NULL" 占位。
     *
     * <p>按忽略大小写匹配：H2 会把未加引号的标识符存成大写，列标签因此是 {@code ID} 而非 {@code id}。
     * 找不到字段时直接抛错——否则测试会因「一直取到 null」而<b>假通过</b>。
     */
    private static String fieldValue(Map<String, Object> fields, String field) {
        for (Map.Entry<String, Object> e : fields.entrySet()) {
            if (e.getKey().equalsIgnoreCase(field)) {
                return e.getValue() == null ? "NULL" : String.valueOf(e.getValue());
            }
        }
        throw new IllegalArgumentException("结果集中不存在字段 " + field + "，实际字段: " + fields.keySet());
    }

    /**
     * 测试用源实现。被验证的分片逻辑全部位于 {@link AbstractJdbcSource}，此处只是绕开
     * MySQL 驱动的 fetchSize=Integer.MIN_VALUE 约定（H2 不接受负值 fetchSize）。
     */
    private static final class H2Source extends AbstractJdbcSource {
        @Override
        protected int fetchSize() {
            return 1000;
        }
    }
}
