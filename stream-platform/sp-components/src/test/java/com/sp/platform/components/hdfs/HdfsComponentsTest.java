package com.sp.platform.components.hdfs;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * HDFS 控件测试。
 *
 * <p>TODO: 需要真实 HDFS 或 MiniDFSCluster（当前环境未引入 hadoop-minicluster），
 * 留待集成环境补充：
 * <ul>
 *   <li>hdfs-sink 写文件 → hdfs-source 读回 round-trip</li>
 *   <li>字节分片读取无重复无丢失（复用 ShardUtils，单机逻辑已被 shard 包测试覆盖）</li>
 *   <li>Kerberos / 简单认证两种模式</li>
 * </ul>
 */
class HdfsComponentsTest {

    @Test
    @Disabled("需要 HDFS MiniDFSCluster 依赖，留待集成环境补充")
    void writeThenReadRoundTrip() {
        // 占位，见类注释 TODO
    }
}
