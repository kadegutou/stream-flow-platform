package com.sp.platform.common.spi;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;

import java.util.List;
import java.util.Map;

/** 输入控件。对应设计文档 §5.1。 */
public interface Source extends StreamComponent, AutoCloseable {

    void open(Map<String, Object> params, Context ctx) throws Exception;

    /** 拉取一批数据；返回空列表表示 EOF */
    List<Row> poll() throws Exception;

    @Override
    default void close() throws Exception {
    }
}
