package com.sp.platform.components.redis;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * Redis  enrich 控件测试。
 *
 * <p>TODO: 需要真实 Redis 或嵌入式实现（当前环境无 Docker），留待集成环境补充：
 * <ul>
 *   <li>pipeline 批量 MGET 命中率与回填字段正确性</li>
 *   <li>本地缓存（cacheSize）LRU 行为与 TTL</li>
 *   <li>key 未命中时缺省值/跳过策略</li>
 * </ul>
 */
class RedisComponentsTest {

    @Test
    @Disabled("需要真实 Redis / Testcontainers，CI 无 Docker 时跳过")
    void enrichRoundTrip() {
        // 占位，见类注释 TODO
    }
}
