package com.sp.platform.control.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 控件注册表。对应设计文档表 component_def（统一加 sp_ 前缀）。
 * 启动时由 SPI 扫描（ComponentRegistry）按 code upsert 同步。
 */
@Entity
@Table(name = "sp_component_def")
public class ComponentDefEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String code;

    @Column(nullable = false, length = 64)
    private String name;

    /** SOURCE / PROCESS / SINK */
    @Column(nullable = false, length = 16)
    private String category;

    @Column(length = 512)
    private String description;

    @Column(length = 64)
    private String icon;

    /** 参数 JSON Schema。TEXT 兼容 H2 与 MySQL。 */
    @Lob
    @Column(name = "param_schema", nullable = false, columnDefinition = "TEXT")
    private String paramSchema;

    @Column(name = "impl_class", nullable = false, length = 256)
    private String implClass;

    /** 1 内置 0 自定义 */
    @Column(nullable = false)
    private Integer builtin = 1;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
    public String getParamSchema() { return paramSchema; }
    public void setParamSchema(String paramSchema) { this.paramSchema = paramSchema; }
    public String getImplClass() { return implClass; }
    public void setImplClass(String implClass) { this.implClass = implClass; }
    public Integer getBuiltin() { return builtin; }
    public void setBuiltin(Integer builtin) { this.builtin = builtin; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
