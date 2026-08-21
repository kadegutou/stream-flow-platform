package com.sp.platform.control.repo;

import com.sp.platform.control.entity.JobEntity;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface JobRepo extends JpaRepository<JobEntity, Long> {

    List<JobEntity> findByOwnerIdOrderByIdDesc(Long ownerId);

    /** 上线用：对作业行加悲观写锁，串行化并发上线，避免重复建实例。 */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select j from JobEntity j where j.id = :id")
    Optional<JobEntity> findByIdForUpdate(@Param("id") Long id);
}
