package com.sp.platform.control.repo;

import com.sp.platform.control.entity.JobInstanceEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface JobInstanceRepo extends JpaRepository<JobInstanceEntity, Long> {

    Optional<JobInstanceEntity> findFirstByJobIdOrderByIdDesc(Long jobId);

    List<JobInstanceEntity> findByJobIdOrderByIdDesc(Long jobId);

    List<JobInstanceEntity> findByJobIdAndStatusIn(Long jobId, List<String> statuses);

    List<JobInstanceEntity> findByStatusIn(List<String> statuses);
}
