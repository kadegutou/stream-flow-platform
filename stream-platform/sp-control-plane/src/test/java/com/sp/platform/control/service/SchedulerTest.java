package com.sp.platform.control.service;

import com.sp.platform.control.entity.JobInstanceEntity;
import com.sp.platform.control.entity.JobShardEntity;
import com.sp.platform.control.entity.WorkerNodeEntity;
import com.sp.platform.control.repo.JobInstanceRepo;
import com.sp.platform.control.repo.JobShardRepo;
import com.sp.platform.control.repo.WorkerNodeRepo;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 调度状态机：分片派发（负载最少 + 乐观锁）、心跳超时重派、实例状态收敛。 */
class SchedulerTest {

    private final WorkerNodeRepo workerRepo = Mockito.mock(WorkerNodeRepo.class);
    private final JobShardRepo shardRepo = Mockito.mock(JobShardRepo.class);
    private final JobInstanceRepo instanceRepo = Mockito.mock(JobInstanceRepo.class);
    private final Scheduler scheduler = new Scheduler(workerRepo, shardRepo, instanceRepo, 30_000);

    @Test
    void assignsPendingShardToLeastLoadedWorker() {
        JobShardEntity s1 = shard(1L);
        JobShardEntity s2 = shard(2L);
        when(shardRepo.findByStatusAndWorkerIdIsNullOrderByIdAsc("PENDING"))
                .thenReturn(List.of(s1, s2));
        WorkerNodeEntity w1 = worker(1L);
        WorkerNodeEntity w2 = worker(2L);
        when(workerRepo.findByStatus("ONLINE")).thenReturn(List.of(w1, w2));
        // w1 已有 3 个 RUNNING，w2 空闲 → 两个分片都应派给 w2
        when(shardRepo.countRunningByWorkerIds(List.of(1L, 2L)))
                .thenReturn(List.of(new Object[]{1L, 3L}, new Object[]{2L, 0L}));
        when(shardRepo.assign(any(), any())).thenReturn(1);

        scheduler.assignPendingShards();

        verify(shardRepo).assign(1L, 2L);
        verify(shardRepo).assign(2L, 2L);
    }

    @Test
    void optimisticLockFailureDoesNotCountLoad() {
        JobShardEntity s1 = shard(1L);
        JobShardEntity s2 = shard(2L);
        when(shardRepo.findByStatusAndWorkerIdIsNullOrderByIdAsc("PENDING"))
                .thenReturn(List.of(s1, s2));
        when(workerRepo.findByStatus("ONLINE")).thenReturn(List.of(worker(1L), worker(2L)));
        when(shardRepo.countRunningByWorkerIds(any())).thenReturn(List.of());
        // s1 被别的控制面抢走（影响行数=0）→ 不增加 w 负载；s2 抢占成功
        when(shardRepo.assign(eq(1L), any())).thenReturn(0);
        when(shardRepo.assign(eq(2L), any())).thenReturn(1);

        scheduler.assignPendingShards();

        verify(shardRepo).assign(eq(1L), any());
        verify(shardRepo).assign(eq(2L), any());
    }

    @Test
    void noPendingNoAssign() {
        when(shardRepo.findByStatusAndWorkerIdIsNullOrderByIdAsc("PENDING"))
                .thenReturn(List.of());
        scheduler.assignPendingShards();
        verify(shardRepo, never()).assign(any(), any());
    }

    @Test
    void staleWorkerGoesOfflineAndShardsReset() {
        WorkerNodeEntity stale = worker(7L);
        stale.setLastHeartbeat(LocalDateTime.now().minusMinutes(5));
        when(workerRepo.findByStatusAndLastHeartbeatBefore(eq("ONLINE"), any()))
                .thenReturn(List.of(stale));

        scheduler.handleWorkerTimeout();

        assertEquals("OFFLINE", stale.getStatus());
        verify(workerRepo).save(stale);
        verify(shardRepo).resetByWorker(7L);
    }

    @Test
    void instanceConvergesToStoppedWhenAllShardsStopped() {
        JobInstanceEntity inst = instance(1L, "RUNNING");
        when(instanceRepo.findByStatusIn(any())).thenReturn(List.of(inst));
        when(shardRepo.findByInstanceId(1L)).thenReturn(List.of(
                shardWithStatus("STOPPED"), shardWithStatus("STOPPED")));

        scheduler.convergeInstances();

        assertEquals("STOPPED", inst.getStatus());
        assertNotNull(inst.getStoppedAt());
        verify(instanceRepo).save(inst);
    }

    @Test
    void instanceConvergesToFailedWhenAnyShardFailed() {
        JobInstanceEntity inst = instance(1L, "RUNNING");
        when(instanceRepo.findByStatusIn(any())).thenReturn(List.of(inst));
        when(shardRepo.findByInstanceId(1L)).thenReturn(List.of(
                shardWithStatus("STOPPED"), shardWithStatus("FAILED")));

        scheduler.convergeInstances();

        assertEquals("FAILED", inst.getStatus());
    }

    @Test
    void instanceConvergesToRunningWhenAnyShardRunning() {
        JobInstanceEntity inst = instance(1L, "PENDING");
        when(instanceRepo.findByStatusIn(any())).thenReturn(List.of(inst));
        when(shardRepo.findByInstanceId(1L)).thenReturn(List.of(
                shardWithStatus("RUNNING"), shardWithStatus("PENDING")));

        scheduler.convergeInstances();

        assertEquals("RUNNING", inst.getStatus());
        assertNotNull(inst.getStartedAt());
    }

    private static JobShardEntity shard(long id) {
        JobShardEntity s = new JobShardEntity();
        s.setId(id);
        s.setStatus("PENDING");
        return s;
    }

    private static JobShardEntity shardWithStatus(String status) {
        JobShardEntity s = new JobShardEntity();
        s.setStatus(status);
        return s;
    }

    private static WorkerNodeEntity worker(long id) {
        WorkerNodeEntity w = new WorkerNodeEntity();
        w.setId(id);
        w.setStatus("ONLINE");
        w.setLastHeartbeat(LocalDateTime.now());
        return w;
    }

    private static JobInstanceEntity instance(long id, String status) {
        JobInstanceEntity i = new JobInstanceEntity();
        i.setId(id);
        i.setStatus(status);
        return i;
    }
}
