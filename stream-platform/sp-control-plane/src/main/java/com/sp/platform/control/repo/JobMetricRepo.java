package com.sp.platform.control.repo;

import com.sp.platform.control.entity.JobMetricEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JobMetricRepo extends JpaRepository<JobMetricEntity, Long> {

    List<JobMetricEntity> findByInstanceIdOrderBySampledAtAsc(Long instanceId);

    void deleteByInstanceIdIn(List<Long> instanceIds);
}
