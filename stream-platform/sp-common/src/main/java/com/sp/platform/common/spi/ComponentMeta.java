package com.sp.platform.common.spi;

/**
 * 控件元数据（注册表项）。对应数据库设计 component_def 表。
 */
public record ComponentMeta(
        String code,
        String name,
        String category,
        String description,
        String icon,
        String paramSchema,
        String implClass) {

    public static ComponentMeta of(Class<? extends StreamComponent> clazz) {
        ComponentDef def = clazz.getAnnotation(ComponentDef.class);
        if (def == null) {
            throw new IllegalArgumentException("控件类缺少 @ComponentDef 注解: " + clazz.getName());
        }
        return new ComponentMeta(def.code(), def.name(), def.category(),
                def.description(), def.icon(), def.paramSchema(), clazz.getName());
    }
}
