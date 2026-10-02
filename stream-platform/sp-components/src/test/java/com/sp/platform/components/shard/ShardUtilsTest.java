package com.sp.platform.components.shard;

import com.sp.platform.components.shard.ShardUtils.ByteRange;
import com.sp.platform.components.shard.ShardUtils.ShardedLineReader;
import org.junit.jupiter.api.Test;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 字节切片：分片读行不重复、不丢失（含 UTF-8 多字节与边界恰好在行首的情况）。 */
class ShardUtilsTest {

    @Test
    void rangeSplitsEvenly() {
        assertEquals(new ByteRange(0, 25), ShardUtils.range(100, 0, 4));
        assertEquals(new ByteRange(25, 50), ShardUtils.range(100, 1, 4));
        assertEquals(new ByteRange(75, 100), ShardUtils.range(100, 3, 4));
        assertEquals(new ByteRange(0, 100), ShardUtils.range(100, 0, 1));
        assertThrows(IllegalArgumentException.class, () -> ShardUtils.range(100, 4, 4));
        assertThrows(IllegalArgumentException.class, () -> ShardUtils.range(100, 0, 0));
    }

    @Test
    void shardedReadCoversAllLinesExactlyOnce() throws Exception {
        // 不等长行 + 中文多字节内容
        StringBuilder sb = new StringBuilder("c1,c2\n");
        for (int i = 1; i <= 1000; i++) {
            sb.append("值").append(i).append(",").append("x".repeat(i % 17)).append('\n');
        }
        byte[] data = sb.toString().getBytes(StandardCharsets.UTF_8);

        List<String> full = readShard(data, 0, 1);
        for (int shards = 2; shards <= 7; shards++) {
            List<String> merged = new ArrayList<>();
            for (int i = 0; i < shards; i++) {
                merged.addAll(readShard(data, i, shards));
            }
            assertEquals(full, merged, "分片数=" + shards + " 时合并结果应与全量一致");
            assertEquals(1001, merged.size());
        }
    }

    @Test
    void boundaryExactlyAtLineStart() throws Exception {
        // 构造分片边界恰好落在行首的场景：两行等长，2 分片
        String text = "aaaa\nbbbb\n"; // 每行 5 字节，size=10，分片边界在 5（第二行行首）
        byte[] data = text.getBytes(StandardCharsets.UTF_8);
        List<String> s0 = readShard(data, 0, 2);
        List<String> s1 = readShard(data, 1, 2);
        assertEquals(List.of("aaaa", "bbbb"), s0); // 边界行由前一分片读完
        assertEquals(List.of(), s1);               // 后一分片丢弃第一行后无数据
    }

    @Test
    void emptyFile() throws Exception {
        assertEquals(List.of(), readShard(new byte[0], 0, 3));
        assertEquals(List.of(), readShard(new byte[0], 1, 3));
    }

    private List<String> readShard(byte[] data, int shardIndex, int totalShards) throws Exception {
        ByteRange range = ShardUtils.range(data.length, shardIndex, totalShards);
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        bais.skip(range.start());
        List<String> lines = new ArrayList<>();
        try (ShardedLineReader reader = new ShardedLineReader(
                new BufferedInputStream(bais), range)) {
            for (String line = reader.readLine(); line != null; line = reader.readLine()) {
                lines.add(line);
            }
        }
        return lines;
    }

    // ==================== 行区间分片（xlsx 等不可随机定位的输入） ====================

    @Test
    void rowRangeTilesWholeFileWithoutGapOrOverlap() {
        assertEquals(new ShardUtils.RowRange(0, 25), ShardUtils.rowRange(100, 0, 4));
        assertEquals(new ShardUtils.RowRange(75, 100), ShardUtils.rowRange(100, 3, 4));
        // 首尾相接、从 0 起、覆盖到 totalRows：任何行数下都不重不漏
        for (long total = 0; total <= 40; total++) {
            long cursor = 0;
            for (int i = 0; i < 7; i++) {
                ShardUtils.RowRange r = ShardUtils.rowRange(total, i, 7);
                assertEquals(cursor, r.start(), "分片区间必须首尾相接");
                cursor = r.endExclusive();
            }
            assertEquals(total, cursor, "最后一个分片的右端点必须等于总行数");
        }
        assertThrows(IllegalArgumentException.class, () -> ShardUtils.rowRange(100, 4, 4));
        assertThrows(IllegalArgumentException.class, () -> ShardUtils.rowRange(100, -1, 4));
        assertThrows(IllegalArgumentException.class, () -> ShardUtils.rowRange(100, 0, 0));
    }

    @Test
    void rowRangeHandlesFewerRowsThanShards() {
        // 行数少于分片数：部分分片区间为空，但整体仍恰好覆盖全部行
        int nonEmpty = 0;
        for (int i = 0; i < 4; i++) {
            ShardUtils.RowRange r = ShardUtils.rowRange(3, i, 4);
            if (r.count() > 0) {
                nonEmpty++;
            }
        }
        assertEquals(3, nonEmpty);
        assertEquals(0, ShardUtils.rowRange(0, 0, 4).count());
    }

    @Test
    void shardPathAppendsPartSuffixBeforeExtension() {
        assertEquals("out.part0.csv", ShardUtils.shardPath("out.csv", 0));
        assertEquals("/tmp/a/out.part2.csv", ShardUtils.shardPath("/tmp/a/out.csv", 2));
        assertEquals("C:\\tmp\\out.part1.xlsx", ShardUtils.shardPath("C:\\tmp\\out.xlsx", 1));
        // 无扩展名：直接追加后缀（不能被目录名里的点误判）
        assertEquals("/tmp.d/out.part0", ShardUtils.shardPath("/tmp.d/out", 0));
        assertEquals("out.part3", ShardUtils.shardPath("out", 3));
    }
}
