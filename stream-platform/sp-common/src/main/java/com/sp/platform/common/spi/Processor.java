package com.sp.platform.common.spi;

import com.sp.platform.common.Context;
import com.sp.platform.common.Row;

import java.util.List;
import java.util.Map;

/** 处理控件。对应设计文档 §5.1。 */
public interface Processor extends StreamComponent {

    void open(Map<String, Object> params, Context ctx) throws Exception;

    List<Row> process(List<Row> batch) throws Exception;
}
