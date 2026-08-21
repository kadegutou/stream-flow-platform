package com.sp.platform.control.repo;

import com.sp.platform.control.entity.JobShardEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface JobShardRepo extends JpaRepository<JobShardEntity, Long> {

    List<JobShardEntity> findByInstanceId(Long instanceId);

    long countByInstanceId(Long instanceId);

    List<JobShardEntity> findByStatusAndWorkerIdIsNullOrderByIdAsc(String status);

    List<JobShardEntity> findByWorkerIdAndStatus(Long workerId, String status);

    @Query("select s.workerId, count(s) from JobShardEntity s "
            + "where s.workerId in :workerIds and s.status = 'RUNNING' group by s.workerId")
    List<Object[]> countRunningByWorkerIds(@Param("workerIds") List<Long> workerIds);

    /** 乐观锁抢占：仅当分片仍 PENDING 且未分配时才指派成功；抢占同时 fenceToken+1。 */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update JobShardEntity s set s.workerId = :workerId, s.fenceToken = s.fenceToken + 1 "
            + "where s.id = :id and s.status = 'PENDING' and s.workerId is null")
    int assign(@Param("id") Long id, @Param("workerId") Long workerId);

    /** Worker 失联：其名下 PENDING/RUNNING 分片重置为待派发。 */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update JobShardEntity s set s.status = 'PENDING', s.workerId = null "
            + "where s.workerId = :workerId and s.status in ('PENDING', 'RUNNING')")
    int resetByWorker(@Param("workerId") Long workerId);
}
