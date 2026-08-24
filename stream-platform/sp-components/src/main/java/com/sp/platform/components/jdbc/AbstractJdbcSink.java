package com.sp.platform.components.jdbc;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;
import com.sp.platform.common.spi.Sink;
import com.sp.platform.components.Params;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.util.List;
import java.util.Map;
import java.util.StringJoiner;

/**
 * JDBC 输出控件抽象基类：batch insert。
 * mysql / postgresql / oracle 控件继承本类，仅提供标识符引号差异与元数据注解。
 */
public abstract class AbstractJdbcSink implements Sink {

    private Connection conn;
    private PreparedStatement ps;
    private List<String> fields;

    /** 标识符引号（MySQL 用反引号，PG/Oracle 用双引号）。 */
    protected abstract String identifierQuote();

    @Override
    public void open(Map<String, Object> params, Context ctx) throws Exception {
        String url = Params.required(params, "url");
        String username = Params.required(params, "username");
        String password = Params.str(params, "password", ""); // 密码可选（无密码库）
        String table = Params.required(params, "table");
        this.fields = Params.strList(params, "fields");

        String q = identifierQuote();
        StringJoiner cols = new StringJoiner(",");
        StringJoiner placeholders = new StringJoiner(",");
        for (String f : fields) {
            cols.add(q + f + q);
            placeholders.add("?");
        }
        String sql = "INSERT INTO " + q + table + q + " (" + cols + ") VALUES (" + placeholders + ")";

        conn = DriverManager.getConnection(url, username, password);
        conn.setAutoCommit(false);
        ps = conn.prepareStatement(sql);
    }

    @Override
    public void write(List<Row> batch) throws Exception {
        try {
            for (Row row : batch) {
                for (int i = 0; i < fields.size(); i++) {
                    ps.setObject(i + 1, row.fields().get(fields.get(i)));
                }
                ps.addBatch();
            }
            ps.executeBatch();
            conn.commit();
        } catch (Exception e) {
            // 写失败回滚事务，立即释放该批持有的元数据锁（MDL），避免挂到连接 close 才释放
            try { conn.rollback(); } catch (Exception ignored) { }
            throw e;
        }
    }

    @Override
    public void close() {
        // 各步骤独立 try-catch：确保 conn.close() 一定执行（释放连接与未提交事务，避免持锁泄漏）
        if (ps != null) {
            try { ps.close(); } catch (Exception ignored) { }
        }
        if (conn != null) {
            try { conn.close(); } catch (Exception ignored) { }
        }
    }
}
