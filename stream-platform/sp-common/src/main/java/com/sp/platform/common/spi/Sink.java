package com.sp.platform.common.spi;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;

import java.util.List;
import java.util.Map;

/** 输出控件。对应设计文档 §5.1。 */
public interface Sink extends StreamComponent, AutoCloseable {

    void open(Map<String, Object> params, Context ctx) throws Exception;

    void write(List<Row> batch) throws Exception;

    @Override
    default void close() throws Exception {
    }
}
