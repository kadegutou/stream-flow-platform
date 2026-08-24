package com.sp.platform.components.jdbc;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.Source;
import com.sp.platform.components.Params;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JDBC 输入控件抽象基类：流式查询（setFetchSize），避免全量加载。
 * mysql / postgresql / oracle 控件继承本类，仅提供驱动差异配置与元数据注解。
 */
public abstract class AbstractJdbcSource implements Source {

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

        conn = DriverManager.getConnection(url, username, password);
        if (disableAutoCommit()) {
            conn.setAutoCommit(false);
        }
        stmt = conn.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY);
        stmt.setFetchSize(fetchSize());
        rs = stmt.executeQuery(sql);
        ResultSetMetaData meta = rs.getMetaData();
        columns = new String[meta.getColumnCount()];
        for (int i = 0; i < columns.length; i++) {
            columns[i] = meta.getColumnLabel(i + 1);
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
