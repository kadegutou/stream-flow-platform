package com.sp.platform.components.excel;

import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.XMLReader;
import org.xml.sax.helpers.DefaultHandler;
import org.xml.sax.helpers.XMLReaderFactory;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 只读共享字符串表（轻量实现）。
 *
 * <p><b>为什么不用 POI 自带的两个实现</b>（实测 10 万行 / 40 万条共享串的 xlsx）：
 * <ul>
 *   <li>{@code SharedStringsTable}（POI 默认）：解析时为每条目构造 {@code XSSFRichTextString}
 *       对象，建表约 1.0~1.7s，且每个分片都要重付一遍；</li>
 *   <li>{@code ReadOnlySharedStringsTable}：建表只要 60ms（快 17~27 倍），但它的
 *       {@code getItemAt(int)} 每次都 {@code new XSSFRichTextString(strings.get(idx))}——
 *       建表省下的时间又被逐格取值时的对象分配吃回去了（40 万格多花约 270ms，
 *       且随单元格数线性增长）。</li>
 * </ul>
 *
 * <p>本实现只保留 {@code String}，建表与取值都无额外包装对象：
 * <b>建表 O(字符串总长)，取值 O(1) 且零分配</b>。
 *
 * <p>兼容性：与 POI 默认实现逐条比对一致——富文本（{@code <si><r><t>}… 多段）按顺序拼接；
 * 同时跳过注音段 {@code <rPh>}（日文假名注音不是单元格内容）。
 */
final class LightSharedStrings extends DefaultHandler {

    private final List<String> entries;
    private final StringBuilder buf = new StringBuilder();
    /** 当前是否位于 {@code <si>} 内（>0 表示在内）。 */
    private int siDepth;
    /** 是否位于注音段 {@code <rPh>} 内：其中的 {@code <t>} 不计入单元格文本。 */
    private boolean inPhonetic;
    /** 是否位于文本节点 {@code <t>} 内。 */
    private boolean inText;

    private LightSharedStrings(int capacity) {
        this.entries = new ArrayList<>(capacity);
    }

    /** 解析 {@code /xl/sharedStrings.xml}。 */
    static LightSharedStrings read(InputStream in, int expectedCount) throws Exception {
        LightSharedStrings table = new LightSharedStrings(Math.max(16, expectedCount));
        XMLReader parser = XMLReaderFactory.createXMLReader();
        parser.setContentHandler(table);
        parser.parse(new InputSource(in));
        return table;
    }

    int size() {
        return entries.size();
    }

    /** 取第 idx 条共享字符串；越界返回 null（脏数据由调用方回退为原始文本）。 */
    String entryAt(int idx) {
        return idx >= 0 && idx < entries.size() ? entries.get(idx) : null;
    }

    @Override
    public void startElement(String uri, String localName, String qName, Attributes attributes) {
        switch (qName) {
            case "si" -> {
                siDepth++;
                buf.setLength(0);
            }
            case "rPh" -> inPhonetic = true;
            case "t" -> inText = true;
            default -> {
            }
        }
    }

    @Override
    public void characters(char[] ch, int start, int length) {
        if (siDepth > 0 && inText && !inPhonetic) {
            buf.append(ch, start, length);
        }
    }

    @Override
    public void endElement(String uri, String localName, String qName) {
        switch (qName) {
            case "t" -> inText = false;
            case "rPh" -> inPhonetic = false;
            case "si" -> {
                siDepth--;
                entries.add(buf.toString());
                buf.setLength(0);
            }
            default -> {
            }
        }
    }
}
