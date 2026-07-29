package com.sp.platform.components;

import com.sp.platform.common.spi.ComponentMeta;
import com.sp.platform.common.spi.StreamComponent;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.ServiceLoader;

/**
 * 控件注册中心：通过 ServiceLoader&lt;StreamComponent&gt; 发现类路径下所有控件，
 * 索引其 @ComponentDef 注解元数据。对应设计文档 §4.2。
 *
 * 使用方：控制面启动时同步 listMeta() 到 component_def 表；Worker 用 create(code) 实例化控件。
 */
public final class ComponentRegistry {

    private static final ComponentRegistry INSTANCE = new ComponentRegistry();

    private final Map<String, Class<? extends StreamComponent>> byCode = new LinkedHashMap<>();
    private final Map<String, ComponentMeta> metaByCode = new LinkedHashMap<>();

    private ComponentRegistry() {
        ServiceLoader<StreamComponent> loader = ServiceLoader.load(StreamComponent.class);
        for (StreamComponent component : loader) {
            @SuppressWarnings("unchecked")
            Class<? extends StreamComponent> clazz =
                    (Class<? extends StreamComponent>) component.getClass();
            ComponentMeta meta = ComponentMeta.of(clazz);
            if (byCode.putIfAbsent(meta.code(), clazz) != null) {
                throw new IllegalStateException("控件编码重复: " + meta.code());
            }
            metaByCode.put(meta.code(), meta);
        }
    }

    public static ComponentRegistry getInstance() {
        return INSTANCE;
    }

    /** 全部控件元数据。 */
    public List<ComponentMeta> listMeta() {
        return Collections.unmodifiableList(new ArrayList<>(metaByCode.values()));
    }

    public ComponentMeta meta(String code) {
        ComponentMeta meta = metaByCode.get(code);
        if (meta == null) {
            throw new IllegalArgumentException("未注册的控件: " + code);
        }
        return meta;
    }

    /** 按编码实例化控件（每次返回新实例）。 */
    public StreamComponent create(String code) {
        Class<? extends StreamComponent> clazz = byCode.get(code);
        if (clazz == null) {
            throw new IllegalArgumentException("未注册的控件: " + code);
        }
        try {
            return clazz.getDeclaredConstructor().newInstance();
        } catch (Exception e) {
            throw new IllegalStateException("控件实例化失败: " + code, e);
        }
    }
}
