package com.sp.platform.components.jdbc;

import com.sp.platform.components.shard.ShardUtils;
import com.sp.platform.components.shard.ShardUtils.ValueRange;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/**
 * JDBC 输入的分片 SQL 生成（设计文档 §7「数据库场景」）。
 *
 * <p>按<b>分片列的取值区间</b>切分：先探测 MIN/MAX，再把取值范围均分为 N 段，每个分片只查询
 * 自己那一段，把扫描负载真正下推给数据库并分摊到 N 个 Worker。
 *
 * <p>为什么不用另两种切法：{@code MOD(c, N) = i} 与 {@code ROW_NUMBER() OVER (...)} 都<b>用不上索引</b>，
 * 每个分片仍要全表扫（后者还要多一次全量排序），数据库侧负载反而是 N 倍——方向正好相反。
 * 区间谓词在分片列有索引时可走 range scan，这才使数据库侧负载随分片数下降。
 *
 * <p>本类只做字符串拼接与数值计算，不触碰数据库连接，因此可被单元测试完整覆盖。
 */
public final class JdbcShardSql {

    /** 包裹用户 SQL 后使用的派生表别名。 */
    private static final String SUB_ALIAS = "sp_shard_src";

    /**
     * 分片列名白名单：字母或下划线开头，其后为字母、数字、下划线或 {@code $}。
     * 限定成这一形态即可裸用列名，既杜绝 SQL 注入，也规避各库标识符引号的差异
     * （MySQL 反引号 / PG、Oracle 双引号）。
     */
    private static final Pattern SAFE_COLUMN = Pattern.compile("[A-Za-z_][A-Za-z0-9_$]*");

    /** 探测不到有效数值边界时，非首分片使用的恒假谓词。 */
    private static final String NO_ROWS = "1 = 0";

    private JdbcShardSql() {
    }

    /**
     * 校验并返回规范化的分片列名。
     *
     * <p>并行度&gt;1 时必须有分片列：宁可拒绝，也不能退化成「每个分片读全量」
     * 而产生 N 倍重复数据。
     */
    public static String validateColumn(String column) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException(
                    "并行度>1 时必须指定分片列 shardColumn（数值型列名，如 id）："
                            + "平台按该列的取值区间切分数据");
        }
        String c = column.trim();
        if (!SAFE_COLUMN.matcher(c).matches()) {
            throw new IllegalArgumentException("分片列名不合法: " + c
                    + "（只允许字母或下划线开头，其后为字母、数字、下划线或 $）");
        }
        return c;
    }

    /**
     * 去掉用户 SQL 末尾的分号与空白。把用户 SQL 包进子查询后，残留分号会造成语法错误
     * ——这是手工拼 SQL 最容易踩的坑。
     */
    public static String stripTrailingSemicolon(String sql) {
        String s = sql == null ? "" : sql.strip();
        while (s.endsWith(";")) {
            s = s.substring(0, s.length() - 1).strip();
        }
        if (s.isEmpty()) {
            throw new IllegalArgumentException("查询 SQL 不能为空");
        }
        return s;
    }

    /** 探测分片列上下界的 SQL：{@code SELECT MIN(c), MAX(c) FROM ( 用户SQL ) alias}。 */
    public static String probeSql(String userSql, String column) {
        String c = validateColumn(column);
        String inner = stripTrailingSemicolon(userSql);
        return "SELECT MIN(" + c + ") AS sp_min, MAX(" + c + ") AS sp_max"
                + " FROM (" + inner + ") " + SUB_ALIAS;
    }

    /**
     * 生成分片 i 的查询 SQL：在用户 SQL 外层套一个派生表，再用分片列区间过滤。
     *
     * <p>谓词构成：
     * <ul>
     *   <li>普通分片：{@code c >= 下界 AND c < 上界}；</li>
     *   <li>末分片：{@code c >= 下界}（不设上界，容忍边界偏差、并接管运行期间新增的更大键值）；</li>
     *   <li>首分片额外 {@code OR c IS NULL}——分片列为 NULL 的行与任何区间比较都为 UNKNOWN，
     *       会同时落在所有分片之外而<b>静默丢失</b>，统一交给首分片承接。</li>
     * </ul>
     *
     * @param min 分片列下界；null 表示探测不到有效数值边界（空表或分片列全为 NULL）
     * @param max 分片列上界；null 同 min
     */
    public static String shardSql(String userSql, String column,
                                  BigDecimal min, BigDecimal max,
                                  int shardIndex, int totalShards) {
        String c = validateColumn(column);
        String inner = stripTrailingSemicolon(userSql);
        String from = " FROM (" + inner + ") " + SUB_ALIAS;
        String col = SUB_ALIAS + "." + c;

        if (min == null || max == null) {
            // 全表没有可用的数值边界：首分片只取分片列为空的行，其余分片取空集。
            // 这样「分片列全为 NULL」的数据不会丢，空表也能正常跑完。
            return shardIndex == 0
                    ? "SELECT *" + from + " WHERE " + col + " IS NULL"
                    : "SELECT *" + from + " WHERE " + NO_ROWS;
        }

        ValueRange r = ShardUtils.valueRange(min, max, shardIndex, totalShards);
        String range = col + " >= " + numeric(r.startInclusive())
                + (r.unboundedEnd() ? "" : " AND " + col + " < " + numeric(r.endExclusive()));
        String predicate = "(" + range + ")"
                + (shardIndex == 0 ? " OR " + col + " IS NULL" : "");
        return "SELECT *" + from + " WHERE " + predicate;
    }

    /**
     * 数值字面量：{@link BigDecimal#toPlainString()} 保证不会输出科学计数法。
     * 取值来源是数据库自身的 MIN/MAX（不是用户输入），因此直接内联无注入风险。
     */
    private static String numeric(BigDecimal v) {
        return v.toPlainString();
    }
}
