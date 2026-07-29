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
 * 作业运行实例表。对应设计文档表 job_instance（统一加 sp_ 前缀）。
 */
@Entity
@Table(name = "sp_job_instance")
public class JobInstanceEntity {

    public static final String PENDING = "PENDING";
    public static final String RUNNING = "RUNNING";
    public static final String STOPPING = "STOPPING";
    public static final String STOPPED = "STOPPED";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "job_id", nullable = false)
    private Long jobId;

    @Column(name = "job_version", nullable = false)
    private Integer jobVersion;

    /** 上线时 DAG 快照（与 job 后续修改隔离）。 */
    @Lob
    @Column(name = "dag_snapshot", nullable = false, columnDefinition = "TEXT")
    private String dagSnapshot;

    /** PENDING / RUNNING / STOPPING / STOPPED / FAILED */
    @Column(nullable = false, length = 16)
    private String status = PENDING;

    @Column(name = "total_rows", nullable = false)
    private Long totalRows = 0L;

    @Lob
    @Column(name = "error_msg", columnDefinition = "TEXT")
    private String errorMsg;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "stopped_at")
    private LocalDateTime stoppedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void prePersist() {
        createdAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getJobId() { return jobId; }
    public void setJobId(Long jobId) { this.jobId = jobId; }
    public Integer getJobVersion() { return jobVersion; }
    public void setJobVersion(Integer jobVersion) { this.jobVersion = jobVersion; }
    public String getDagSnapshot() { return dagSnapshot; }
    public void setDagSnapshot(String dagSnapshot) { this.dagSnapshot = dagSnapshot; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getTotalRows() { return totalRows; }
    public void setTotalRows(Long totalRows) { this.totalRows = totalRows; }
    public String getErrorMsg() { return errorMsg; }
    public void setErrorMsg(String errorMsg) { this.errorMsg = errorMsg; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
    public LocalDateTime getStoppedAt() { return stoppedAt; }
    public void setStoppedAt(LocalDateTime stoppedAt) { this.stoppedAt = stoppedAt; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
