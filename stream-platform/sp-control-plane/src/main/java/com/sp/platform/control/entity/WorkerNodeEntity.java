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
 * Worker 节点表。对应设计文档表 worker_node（统一加 sp_ 前缀）。
 */
@Entity
@Table(name = "sp_worker_node")
public class WorkerNodeEntity {

    public static final String ONLINE = "ONLINE";
    public static final String OFFLINE = "OFFLINE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 节点标识（hostname-pid 或容器名） */
    @Column(name = "node_code", nullable = false, unique = true, length = 64)
    private String nodeCode;

    /** host:port */
    @Column(nullable = false, length = 128)
    private String address;

    /** ONLINE / OFFLINE */
    @Column(nullable = false, length = 16)
    private String status = ONLINE;

    @Column(name = "last_heartbeat", nullable = false)
    private LocalDateTime lastHeartbeat;

    @Column(name = "registered_at", nullable = false)
    private LocalDateTime registeredAt;

    @PrePersist
    void prePersist() {
        registeredAt = LocalDateTime.now();
        if (lastHeartbeat == null) {
            lastHeartbeat = registeredAt;
        }
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNodeCode() { return nodeCode; }
    public void setNodeCode(String nodeCode) { this.nodeCode = nodeCode; }
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getLastHeartbeat() { return lastHeartbeat; }
    public void setLastHeartbeat(LocalDateTime lastHeartbeat) { this.lastHeartbeat = lastHeartbeat; }
    public LocalDateTime getRegisteredAt() { return registeredAt; }
}
