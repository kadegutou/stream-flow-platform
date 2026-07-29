package com.sp.platform.components.shard;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * 文件字节切片工具（设计文档 §7 横向扩展：大文件按字节偏移切片，按行边界对齐）。
 * csv-source / hdfs-source 共用同一套逻辑。
 *
 * <p>切分规则：文件按大小均分为 n 个区间，分片 i 的原始区间为
 * {@code [size*i/n, size*(i+1)/n)}（endExclusive）。为保证分片间不重复不丢失：
 * <ul>
 *   <li>start &gt; 0 时起点可能落在某行中间，丢弃第一行（该行由上一分片负责读完）；</li>
 *   <li>持续读行，直到「下一行起始偏移」越过 endExclusive 为止——即起始偏移恰好等于
 *       endExclusive 的行仍由本分片读完，下一分片会在丢弃第一行时跳过它。</li>
 * </ul>
 */
public final class ShardUtils {

    private ShardUtils() {
    }

    /** 分片字节区间。 */
    public record ByteRange(long start, long endExclusive) {
    }

    /** 计算分片 i 的原始字节区间 [size*i/n, size*(i+1)/n)。 */
    public static ByteRange range(long size, int shardIndex, int totalShards) {
        if (shardIndex < 0 || shardIndex >= totalShards || totalShards < 1) {
            throw new IllegalArgumentException(
                    "非法分片参数: shardIndex=" + shardIndex + ", totalShards=" + totalShards);
        }
        long start = size * shardIndex / totalShards;
        long end = size * (shardIndex + 1) / totalShards;
        return new ByteRange(start, end);
    }

    /**
     * 按分片区间读取文本行的读取器。调用方负责把 InputStream 定位到 range.start()
     * （本地文件用 channel.position，HDFS 用 FSDataInputStream.seek）。
     *
     * <p>行边界判定基于原始字节：'\n'（0x0A）不会出现在 UTF-8 等多字节编码的
     * 后续字节中，因此按字节找换行是安全的。
     */
    public static final class ShardedLineReader implements Closeable {

        private static final int INITIAL_LINE_CAP = 256;

        private final InputStream in;
        private final Charset charset;
        private final long endExclusive;
        /** 已消费字节的绝对偏移（下一行的起始偏移）。 */
        private long consumed;
        private boolean firstLineDiscarded;

        public ShardedLineReader(InputStream positionedIn, ByteRange range) {
            this(positionedIn, range, StandardCharsets.UTF_8);
        }

        public ShardedLineReader(InputStream positionedIn, ByteRange range, Charset charset) {
            this.in = positionedIn;
            this.charset = charset;
            this.endExclusive = range.endExclusive();
            this.consumed = range.start();
            this.firstLineDiscarded = range.start() <= 0; // start=0 无需丢弃
        }

        /**
         * 读下一行（不含换行符）；越过本分片区间或流结束返回 null。
         */
        public String readLine() throws IOException {
            if (!firstLineDiscarded) {
                firstLineDiscarded = true;
                if (readRawLine() == null) {
                    return null; // 区间起点之后已无数据
                }
            }
            // consumed 即下一行起始偏移；> endExclusive 说明上一行已读完整个边界行
            if (consumed > endExclusive) {
                return null;
            }
            return readRawLine();
        }

        /** 读原始字节行并推进 consumed；流结束返回 null。 */
        private String readRawLine() throws IOException {
            byte[] buf = new byte[INITIAL_LINE_CAP];
            int len = 0;
            while (true) {
                int b = in.read();
                if (b < 0) {
                    return len == 0 ? null : decode(buf, len);
                }
                consumed++;
                if (b == '\n') {
                    return decode(buf, len);
                }
                if (len == buf.length) {
                    buf = Arrays.copyOf(buf, buf.length * 2);
                }
                buf[len++] = (byte) b;
            }
        }

        private String decode(byte[] buf, int len) {
            if (len > 0 && buf[len - 1] == '\r') {
                len--;
            }
            return new String(buf, 0, len, charset);
        }

        @Override
        public void close() throws IOException {
            in.close();
        }
    }
}
