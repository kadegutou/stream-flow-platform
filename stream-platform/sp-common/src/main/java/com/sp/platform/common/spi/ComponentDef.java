package com.sp.platform.common.spi;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 控件元数据声明注解。paramSchema 为 JSON Schema 字符串，
 * 前端据此动态渲染参数表单。对应设计文档 §4.2。
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
public @interface ComponentDef {

    /** 控件编码，全局唯一，如 csv-source */
    String code();

    /** 显示名 */
    String name();

    /** SOURCE / PROCESS / SINK */
    String category();

    /** 功能描述 */
    String description() default "";

    /** 前端图标标识 */
    String icon() default "";

    /** 参数 JSON Schema 字符串 */
    String paramSchema() default "{}";
}
