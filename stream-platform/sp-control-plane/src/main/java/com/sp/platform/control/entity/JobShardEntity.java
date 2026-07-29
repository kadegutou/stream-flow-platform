package com.sp.platform.control.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * 作业分片表。对应设计文档表 job_shard（统一加 sp_ 前缀）。
 */
@Entity
@Table(name = "sp_job_shard",
        uniqueConstraints = @UniqueConstraint(name = "uk_instance_shard",
                columnNames = {"instance_id", "shard_index"}))
public class JobShardEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "instance_id", nullable = false)
    private Long instanceId;

    @Column(name = "shard_index", nullable = false)
    private Integer shardIndex;

    /** 分片键（如 Kafka 分区号、文件偏移区间），未分片为 null */
    @Column(name = "shard_key", length = 256)
    private String shardKey;

    /** 指派的 Worker，未分配为 null */
    @Column(name = "worker_id")
    private Long workerId;

    /** PENDING / RUNNING / STOPPING / STOPPED / FAILED */
    @Column(nullable = false, length = 16)
    private String status = JobInstanceEntity.PENDING;

    @Column(name = "total_rows", nullable = false)
    private Long totalRows = 0L;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getInstanceId() { return instanceId; }
    public void setInstanceId(Long instanceId) { this.instanceId = instanceId; }
    public Integer getShardIndex() { return shardIndex; }
    public void setShardIndex(Integer shardIndex) { this.shardIndex = shardIndex; }
    public String getShardKey() { return shardKey; }
    public void setShardKey(String shardKey) { this.shardKey = shardKey; }
    public Long getWorkerId() { return workerId; }
    public void setWorkerId(Long workerId) { this.workerId = workerId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getTotalRows() { return totalRows; }
    public void setTotalRows(Long totalRows) { this.totalRows = totalRows; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
