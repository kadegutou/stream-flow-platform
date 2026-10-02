package com.sp.platform.components.shard;

import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.math.MathContext;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * 分片切分工具（设计文档 §7 横向扩展）。平台共三种切分口径，公式同构（均为 {@code size*i/n} 均分）：
 * <ul>
 *   <li><b>字节区间</b>{@link #range}——可随机定位的文本文件，csv-source / hdfs-source 共用；</li>
 *   <li><b>行区间</b>{@link #rowRange}——不可随机定位的压缩容器（xlsx），excel-source 使用；</li>
 *   <li><b>数值区间</b>{@link #valueRange}——数据库输入，按分片列取值区间下推到 SQL，JDBC 源使用。</li>
 * </ul>
 * 三者共用「区间首尾相接 + 末分片不设上界」的不重不漏保证。
 *
 * <p>字节切分规则：文件按大小均分为 n 个区间，分片 i 的原始区间为
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
            this(positionedIn, range, charset, range.start() > 0);
        }

        /**
         * @param discardFirstLine true=起点可能在行中间，丢弃第一行（分片场景）；
         *                         false=起点已对齐行边界（断点续传场景，offset 由本组件记录）
         */
        public ShardedLineReader(InputStream positionedIn, ByteRange range, Charset charset,
                                 boolean discardFirstLine) {
            this.in = positionedIn;
            this.charset = charset;
            this.endExclusive = range.endExclusive();
            this.consumed = range.start();
            this.firstLineDiscarded = !discardFirstLine;
        }

        /** 当前读取进度（绝对字节偏移，行边界）。断点续传上报用。 */
        public long position() {
            return consumed;
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

    // ==================== 行区间分片（用于不可随机定位的输入） ====================

    /**
     * 行区间：分片 i 负责的 <b>数据行序号</b> 半开区间 {@code [start, endExclusive)}，
     * 序号从 0 开始、不含表头。
     *
     * <p>用于 xlsx 这类「压缩容器」输入：sheet1.xml 被 deflate 压缩，无法像 CSV 那样
     * 按字节偏移定位到第 N 行，因此改用行序号切分——每个分片仍从文件头顺序解析，
     * 但只物化落在自己区间内的行（其余行直接跳过，不做单元格解析与共享串查表）。
     */
    public record RowRange(long start, long endExclusive) {

        /** 本分片负责的行数（可为 0：总行数少于分片数时部分分片为空）。 */
        public long count() {
            return Math.max(0, endExclusive - start);
        }

        /** 行序号是否落在本分片区间内。 */
        public boolean contains(long row) {
            return row >= start && row < endExclusive;
        }

        /** 是否已越过本分片区间（用于提前终止解析）。 */
        public boolean passed(long row) {
            return row >= endExclusive;
        }
    }

    /** 计算分片 i 的行区间 {@code [totalRows*i/n, totalRows*(i+1)/n)}，与字节切分同公式。 */
    public static RowRange rowRange(long totalRows, int shardIndex, int totalShards) {
        if (shardIndex < 0 || shardIndex >= totalShards || totalShards < 1) {
            throw new IllegalArgumentException(
                    "非法分片参数: shardIndex=" + shardIndex + ", totalShards=" + totalShards);
        }
        long rows = Math.max(0, totalRows);
        long start = rows * shardIndex / totalShards;
        long end = rows * (shardIndex + 1) / totalShards;
        return new RowRange(start, end);
    }

    // ==================== 数值区间分片（用于数据库输入） ====================

    /**
     * 数值区间：分片 i 负责的分片列取值半开区间 {@code [startInclusive, endExclusive)}。
     *
     * <p>{@code unboundedEnd=true} 表示末分片不设上界（只判下界）——与字节区间 / 行区间
     * 「末分片不设上界」的原则一致，既可容忍边界探测偏差，也能让作业运行期间新写入的、
     * 分片键更大的行被末分片接管。
     */
    public record ValueRange(BigDecimal startInclusive, BigDecimal endExclusive, boolean unboundedEnd) {
    }

    /**
     * 计算分片 i 的取值区间，公式与 {@link #range} / {@link #rowRange} 同构：
     * {@code start = min + (max-min)*i/n}、{@code end = min + (max-min)*(i+1)/n}。
     *
     * <p><b>边界严格相接</b>：分片 i 的 end 与分片 i+1 的 start 由同一个表达式求值，
     * 因此即便除法引入舍入，两者也必然相等——既不会重叠、也不会留缝。取值恰好等于边界时
     * 归入上界一侧的分片（{@code >= start} 命中，{@code < end} 排除）。
     *
     * <p>末分片返回的 {@code endExclusive} 为 {@code null}（不设上界）。
     * 当 {@code min == max}（分片列取值全相同）时，除末分片外各区间均为空，
     * 全部数据由末分片承接——仍然不重不漏，只是负载不均。
     */
    public static ValueRange valueRange(BigDecimal min, BigDecimal max,
                                        int shardIndex, int totalShards) {
        if (shardIndex < 0 || shardIndex >= totalShards || totalShards < 1) {
            throw new IllegalArgumentException(
                    "非法分片参数: shardIndex=" + shardIndex + ", totalShards=" + totalShards);
        }
        if (min == null || max == null) {
            throw new IllegalArgumentException("分片上下界不能为 null（空表或分片列全为 NULL）");
        }
        BigDecimal span = max.subtract(min);
        BigDecimal n = BigDecimal.valueOf(totalShards);
        BigDecimal lower = offset(min, span, shardIndex, n);
        if (shardIndex == totalShards - 1) {
            return new ValueRange(lower, null, true);
        }
        return new ValueRange(lower, offset(min, span, shardIndex + 1, n), false);
    }

    private static BigDecimal offset(BigDecimal min, BigDecimal span, int index, BigDecimal n) {
        return min.add(span.multiply(BigDecimal.valueOf(index), MathContext.DECIMAL128)
                .divide(n, MathContext.DECIMAL128));
    }

    // ==================== 分片输出路径 ====================

    /**
     * 分片输出路径：{@code out.csv → out.part0.csv}，无扩展名时直接追加后缀。
     * csv-sink / hdfs-sink / excel-sink 共用同一规则，下游按 {@code *.part*} 通配汇总。
     */
    public static String shardPath(String path, int shardIndex) {
        int dot = path.lastIndexOf('.');
        int slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
        if (dot > slash) {
            return path.substring(0, dot) + ".part" + shardIndex + path.substring(dot);
        }
        return path + ".part" + shardIndex;
    }
}
