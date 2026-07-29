package com.sp.platform.control.repo;

import com.sp.platform.control.entity.WorkerNodeEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface WorkerNodeRepo extends JpaRepository<WorkerNodeEntity, Long> {

    Optional<WorkerNodeEntity> findByNodeCode(String nodeCode);

    List<WorkerNodeEntity> findByStatus(String status);

    List<WorkerNodeEntity> findByStatusAndLastHeartbeatBefore(String status, LocalDateTime before);
}
