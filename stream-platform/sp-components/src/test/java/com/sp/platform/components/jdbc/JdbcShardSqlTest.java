package com.sp.platform.components.jdbc;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** JDBC 分片 SQL 生成：列名校验、分号清理、区间谓词、NULL 承接、数值字面量格式。 */
class JdbcShardSqlTest {

    private static final String SQL = "SELECT id, name FROM t";

    @Test
    void validateColumnAcceptsSafeNamesOnly() {
        assertEquals("id", JdbcShardSql.validateColumn("  id  "));
        assertEquals("_x$1", JdbcShardSql.validateColumn("_x$1"));

        IllegalArgumentException blank =
                assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.validateColumn(null));
        // 报错必须点名 shardColumn，用户才知道该补哪个参数
        assertTrue(blank.getMessage().contains("shardColumn"), blank.getMessage());
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.validateColumn("   "));

        // 注入与非法标识符一律拒绝
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.validateColumn("id; DROP TABLE t"));
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.validateColumn("1id"));
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.validateColumn("id name"));
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.validateColumn("id`"));
    }

    @Test
    void stripTrailingSemicolonRemovesTrailingSeparators() {
        assertEquals("SELECT 1", JdbcShardSql.stripTrailingSemicolon("  SELECT 1;  "));
        assertEquals("SELECT 1", JdbcShardSql.stripTrailingSemicolon("SELECT 1;;"));
        assertEquals("SELECT 1", JdbcShardSql.stripTrailingSemicolon("SELECT 1"));
        // 只去尾部，语句中间的其它字符不动
        assertEquals("SELECT ';' AS c", JdbcShardSql.stripTrailingSemicolon("SELECT ';' AS c"));
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.stripTrailingSemicolon("  "));
        assertThrows(IllegalArgumentException.class, () -> JdbcShardSql.stripTrailingSemicolon(null));
    }

    @Test
    void probeSqlWrapsUserQueryAndStripsSemicolon() {
        assertEquals("SELECT MIN(id) AS sp_min, MAX(id) AS sp_max FROM (SELECT id FROM t) sp_shard_src",
                JdbcShardSql.probeSql("SELECT id FROM t;", "id"));
    }

    @Test
    void shardSqlTilesRangeAndOnlyFirstShardTakesNulls() {
        String s0 = JdbcShardSql.shardSql(SQL, "id", bd(0), bd(100), 0, 4);
        assertTrue(s0.contains("sp_shard_src.id >= 0"), s0);
        assertTrue(s0.contains("sp_shard_src.id < 25"), s0);
        // 分片列为 NULL 的行与任何区间比较都是 UNKNOWN，必须由首分片兜住，否则静默丢数据
        assertTrue(s0.contains("OR sp_shard_src.id IS NULL"), s0);

        String s1 = JdbcShardSql.shardSql(SQL, "id", bd(0), bd(100), 1, 4);
        assertTrue(s1.contains("sp_shard_src.id >= 25"), s1);
        assertTrue(s1.contains("sp_shard_src.id < 50"), s1);
        assertFalse(s1.contains("IS NULL"), s1);

        String s3 = JdbcShardSql.shardSql(SQL, "id", bd(0), bd(100), 3, 4);
        assertTrue(s3.contains("sp_shard_src.id >= 75"), s3);
        assertFalse(s3.contains("sp_shard_src.id <"), "末分片不设上界: " + s3);
        assertFalse(s3.contains("IS NULL"), s3);
    }

    @Test
    void shardSqlHandlesMissingBounds() {
        // 探测不到有效数值边界（空表 / 分片列全为 NULL）：首分片取 NULL 行，其余取空集
        String n0 = JdbcShardSql.shardSql(SQL, "id", null, null, 0, 3);
        assertTrue(n0.contains("sp_shard_src.id IS NULL"), n0);
        String n1 = JdbcShardSql.shardSql(SQL, "id", null, null, 1, 3);
        assertTrue(n1.contains("1 = 0"), n1);
        String n2 = JdbcShardSql.shardSql(SQL, "id", null, null, 2, 3);
        assertTrue(n2.contains("1 = 0"), n2);
    }

    @Test
    void shardSqlEmitsPlainNumericLiterals() {
        // 边界值来自库内 MIN/MAX，可能是科学计数法表示，内联时必须转成普通写法
        String s = JdbcShardSql.shardSql(SQL, "id", new BigDecimal("1E+3"), new BigDecimal("2E+3"), 0, 2);
        Matcher lower = Pattern.compile("sp_shard_src\\.id >= ([0-9.]+)").matcher(s);
        Matcher upper = Pattern.compile("sp_shard_src\\.id < ([0-9.]+)").matcher(s);
        assertTrue(lower.find(), s);
        assertTrue(upper.find(), s);
        assertFalse(lower.group(1).toUpperCase().contains("E"), "下界不应含科学计数法: " + s);
        assertFalse(upper.group(1).toUpperCase().contains("E"), "上界不应含科学计数法: " + s);
        assertEquals(0, new BigDecimal(lower.group(1)).compareTo(bd(1000)));
        assertEquals(0, new BigDecimal(upper.group(1)).compareTo(bd(1500)));
    }

    @Test
    void shardSqlWrapsButDoesNotRewriteUserQuery() {
        String s = JdbcShardSql.shardSql("SELECT id, name FROM t WHERE flag = 1", "id", bd(0), bd(9), 1, 2);
        assertTrue(s.startsWith(
                "SELECT * FROM (SELECT id, name FROM t WHERE flag = 1) sp_shard_src WHERE "), s);
    }

    private static BigDecimal bd(long v) {
        return BigDecimal.valueOf(v);
    }
}
