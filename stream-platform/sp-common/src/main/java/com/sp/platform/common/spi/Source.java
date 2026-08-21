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

    /**
     * 断点续传：返回当前读取进度（如文件字节偏移），供引擎周期性上报控制面持久化；
     * 返回 -1 表示不支持进度（默认）。崩溃重跑时控制面把该值以 resumeOffset 参数注入。
     */
    default long progress() {
        return -1;
    }

    @Override
    default void close() throws Exception {
    }
}
