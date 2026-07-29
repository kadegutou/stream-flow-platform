package com.sp.platform.control.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 作业吞吐采样表。对应设计文档表 job_metric（统一加 sp_ 前缀）。
 */
@Entity
@Table(name = "sp_job_metric")
public class JobMetricEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "instance_id", nullable = false)
    private Long instanceId;

    @Column(name = "rows_per_sec", nullable = false)
    private Long rowsPerSec;

    @Column(name = "total_rows", nullable = false)
    private Long totalRows;

    @Column(name = "sampled_at", nullable = false)
    private LocalDateTime sampledAt;

    @PrePersist
    void prePersist() {
        if (sampledAt == null) {
            sampledAt = LocalDateTime.now();
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getInstanceId() { return instanceId; }
    public void setInstanceId(Long instanceId) { this.instanceId = instanceId; }
    public Long getRowsPerSec() { return rowsPerSec; }
    public void setRowsPerSec(Long rowsPerSec) { this.rowsPerSec = rowsPerSec; }
    public Long getTotalRows() { return totalRows; }
    public void setTotalRows(Long totalRows) { this.totalRows = totalRows; }
    public LocalDateTime getSampledAt() { return sampledAt; }
    public void setSampledAt(LocalDateTime sampledAt) { this.sampledAt = sampledAt; }
}
