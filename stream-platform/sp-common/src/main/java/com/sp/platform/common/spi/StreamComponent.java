package com.sp.platform.common.spi;

/**
 * 控件标记接口：所有控件（Source/Processor/Sink）的顶层类型，
 * 用于 ServiceLoader 发现。每个实现类必须标注 {@link ComponentDef}。
 */
public interface StreamComponent {
}
