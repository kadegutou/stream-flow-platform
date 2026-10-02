package com.sp.platform.components.jdbc;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JDBC 输入控件抽象基类：流式查询（setFetchSize），避免全量加载。
 * mysql / postgresql / oracle 控件继承本类，仅提供驱动差异配置与元数据注解。
 *
 * <p>并行分片：并行度&gt;1 时按<b>分片列的取值区间</b>切分（见 {@link JdbcShardSql}），
 * 每个分片只扫描自己那一段，区间谓词可下推、走索引 range scan。
 */
public abstract class AbstractJdbcSource implements Source {

    private static final Logger log = LoggerFactory.getLogger(AbstractJdbcSource.class);

    private Connection conn;
    private Statement stmt;
    private ResultSet rs;
    private String[] columns;
    private int batchSize;
    private boolean eof;

    /** 流式读取的 fetchSize。MySQL 驱动要求 Integer.MIN_VALUE，PG/Oracle 用正数即可。 */
    protected abstract int fetchSize();

    /** 是否关闭 autoCommit（MySQL 流式读取要求 false）。 */
    protected boolean disableAutoCommit() {
        return true;
    }

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String url = Params.required(params, "url");
        String username = Params.required(params, "username");
        String password = Params.str(params, "password", ""); // 密码可选（无密码库）
        String sql = Params.required(params, "sql");
        this.batchSize = Params.integer(params, "batchSize", 5000);
        // 分片参数由执行引擎强制注入（并行度=1 时为 0/1），用户表单无法篡改
        int shardIndex = Params.integer(params, "shardIndex", 0);
        int totalShards = Params.integer(params, "totalShards", 1);

        conn = DriverManager.getConnection(url, username, password);
        if (disableAutoCommit()) {
            conn.setAutoCommit(false);
        }

        // 并行度=1 时完全不改写用户 SQL，行为与改造前逐字一致
        String effectiveSql = sql;
        if (totalShards > 1) {
            String shardColumn = JdbcShardSql.validateColumn(Params.str(params, "shardColumn", null));
            BigDecimal[] bounds = probeBounds(sql, shardColumn);
            effectiveSql = JdbcShardSql.shardSql(sql, shardColumn, bounds[0], bounds[1],
                    shardIndex, totalShards);
            log.info("JDBC 分片 {}/{} 就绪：分片列={}，探测区间=[{}, {}]，下推 SQL={}",
                    shardIndex, totalShards, shardColumn, bounds[0], bounds[1], effectiveSql);
        }

        // 注意：这里必须用 Statement 而非 PreparedStatement——MySQL 驱动的流式读取依赖
        // fetchSize=Integer.MIN_VALUE 这一约定，而 PreparedStatement 走流式需要 URL 上追加
        // useCursorFetch=true，改用 PS 会让大表读取退化成全量加载内存（OOM）。
        // 因此区间边界以字面量内联进 SQL（取值来自库内 MIN/MAX，非用户输入，无注入风险）。
        stmt = conn.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY);
        stmt.setFetchSize(fetchSize());
        rs = stmt.executeQuery(effectiveSql);
        ResultSetMetaData meta = rs.getMetaData();
        columns = new String[meta.getColumnCount()];
        for (int i = 0; i < columns.length; i++) {
            columns[i] = meta.getColumnLabel(i + 1);
        }
    }

    /**
     * 探测分片列的取值上下界，返回 {@code [min, max]}（探测不到时为 null）。
     *
     * <p>用独立 Statement 执行并读完即关：MySQL 流式读取期间，同一连接上不允许存在
     * 未消费完的结果集。
     */
    private BigDecimal[] probeBounds(String userSql, String shardColumn) throws SQLException {
        String probe = JdbcShardSql.probeSql(userSql, shardColumn);
        try (Statement probeStmt = conn.createStatement();
             ResultSet probeRs = probeStmt.executeQuery(probe)) {
            if (!probeRs.next()) {
                return new BigDecimal[]{null, null};
            }
            return new BigDecimal[]{probeRs.getBigDecimal(1), probeRs.getBigDecimal(2)};
        } catch (SQLException e) {
            throw new SQLException("探测分片列 " + shardColumn + " 的取值边界失败"
                    + "（该列需为数值型且包含在查询结果中）: " + e.getMessage(), e);
        }
    }

    @Override
    public List<Row> poll() throws Exception {
        if (eof) {
            return List.of();
        }
        List<Row> batch = new ArrayList<>(batchSize);
        while (batch.size() < batchSize && rs.next()) {
            Map<String, Object> fields = new LinkedHashMap<>(columns.length * 2);
            for (int i = 0; i < columns.length; i++) {
                fields.put(columns[i], rs.getObject(i + 1));
            }
            batch.add(new Row(fields));
        }
        if (batch.size() < batchSize) {
            eof = true;
        }
        return batch;
    }

    @Override
    public void close() {
        // 流式结果集可能未读完（作业中途停止/FAILED）：先 cancel 中断服务器端查询，
        // 避免 rs.close() 阻塞（MySQL 流式模式下未读完全部结果集时关闭会等待）。
        // 各步骤独立 try-catch，确保 conn.close() 一定执行，防止连接未释放、
        // 未提交事务长期持有 MySQL 元数据锁（MDL）。
        if (stmt != null) {
            try { stmt.cancel(); } catch (Exception ignored) { }
        }
        if (rs != null) {
            try { rs.close(); } catch (Exception ignored) { }
        }
        if (stmt != null) {
            try { stmt.close(); } catch (Exception ignored) { }
        }
        if (conn != null) {
            try { conn.close(); } catch (Exception ignored) { }
        }
    }
}
