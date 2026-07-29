package com.sp.platform.control.repo;

import com.sp.platform.control.entity.JobEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface JobRepo extends JpaRepository<JobEntity, Long> {

    List<JobEntity> findByOwnerIdOrderByIdDesc(Long ownerId);
}
