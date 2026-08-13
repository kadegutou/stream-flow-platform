package com.sp.platform.components.csv;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** CsvParser：RFC 4180 引号语义 + 快速路径一致性 + 写出转义。 */
class CsvParserTest {

    @Test
    void fastSplitBasic() {
        assertArrayEquals(new String[]{"a", "b", "c"}, CsvParser.fastSplit("a,b,c", ","));
        assertArrayEquals(new String[]{"a", "", "c"}, CsvParser.fastSplit("a,,c", ","));
        assertArrayEquals(new String[]{"a", ""}, CsvParser.fastSplit("a,", ",")); // 尾空字段保留
        assertArrayEquals(new String[]{""}, CsvParser.fastSplit("", ","));
        // 多字符分隔符
        assertArrayEquals(new String[]{"a", "b"}, CsvParser.fastSplit("a||b", "||"));
    }

    @Test
    void quotedFieldWithDelimiter() {
        assertArrayEquals(new String[]{"1", "张,三", "北京"},
                CsvParser.parseLine("1,\"张,三\",北京", ",", "auto"));
    }

    @Test
    void quotedFieldWithEscapedQuote() {
        // "say ""hi""" → say "hi"
        assertArrayEquals(new String[]{"say \"hi\"", "x"},
                CsvParser.parseLine("\"say \"\"hi\"\"\",x", ",", "auto"));
    }

    @Test
    void quotedMixedCommaAndQuote() {
        // "a,""b""",c → a,"b" , c
        assertArrayEquals(new String[]{"a,\"b\"", "c"},
                CsvParser.parseLine("\"a,\"\"b\"\"\",c", ",", "auto"));
        // 引号字段整体为空
        assertArrayEquals(new String[]{"", "y"}, CsvParser.parseLine("\"\",y", ",", "auto"));
    }

    @Test
    void fastPathAndFullParseConsistentWhenNoQuote() {
        String line = "v1,v2,,v4,中文值,";
        assertArrayEquals(CsvParser.fastSplit(line, ","),
                CsvParser.parseLine(line, ",", "auto"));
    }

    @Test
    void quoteModeNoneTreatsQuoteAsNormalChar() {
        assertArrayEquals(new String[]{"\"a", "b\""},
                CsvParser.parseLine("\"a,b\"", ",", "none"));
    }

    @Test
    void unclosedQuoteRejected() {
        assertThrows(IllegalArgumentException.class,
                () -> CsvParser.parseLine("\"abc,x", ",", "auto"));
    }

    @Test
    void escapeRules() {
        assertEquals("plain", CsvParser.escape("plain", ","));
        assertEquals("\"a,b\"", CsvParser.escape("a,b", ","));
        assertEquals("\"say \"\"hi\"\"\"", CsvParser.escape("say \"hi\"", ","));
        assertEquals("\"a\nb\"", CsvParser.escape("a\nb", ","));
        assertEquals("", CsvParser.escape(null, ","));
    }
}
