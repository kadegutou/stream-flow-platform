"""XML ↔ JSON 互转控件 (lxml 实现)"""

import json
from typing import Optional
from lxml import etree
from ...engine.component_base import BaseComponent, register_component


def _extract_payload(inputs: Optional[dict], default):
    """从上游数据中提取报文: 兼容 str / list / list-of-dict"""
    raw = inputs.get("data", default) if inputs else default
    if isinstance(raw, list):
        raw = raw[0] if raw else default
    if isinstance(raw, dict):
        # 行式字典取第一个字段值（如 kafka-input 输出的 {"message": "..."}）
        raw = next(iter(raw.values()), default)
    return raw


@register_component
class XmlToJsonComponent(BaseComponent):
    component_type = "process"
    component_name = "xml2json"
    display_name = "XML → JSON"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        xml_str = _extract_payload(inputs, "")
        if not xml_str:
            return {"data": "{}", "rows": 0}

        root = etree.fromstring(
            xml_str.encode("utf-8") if isinstance(xml_str, str) else xml_str
        )
        result = {root.tag: self._to_dict(root)}

        return {"data": json.dumps(result, ensure_ascii=False), "rows": 1}

    def _to_dict(self, element) -> dict:
        d: dict = {}
        for child in element:
            value = self._to_dict(child) if len(child) > 0 else (child.text or "")
            if child.tag in d:
                # 同名子元素 → 数组
                if not isinstance(d[child.tag], list):
                    d[child.tag] = [d[child.tag]]
                d[child.tag].append(value)
            else:
                d[child.tag] = value
        return d

    def get_config_schema(self) -> dict:
        return {"type": "object", "properties": {}}


@register_component
class JsonToXmlComponent(BaseComponent):
    component_type = "process"
    component_name = "json2xml"
    display_name = "JSON → XML"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        raw = _extract_payload(inputs, "{}")
        data = json.loads(raw) if isinstance(raw, str) else raw

        root = etree.Element("root")
        self._to_xml(root, data)

        result = etree.tostring(root, encoding="unicode", pretty_print=True)
        return {"data": result, "rows": 1}

    def _to_xml(self, parent: etree._Element, data):
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list):
                    # 数组 → 多个同名子元素
                    for item in v:
                        child = etree.SubElement(parent, k)
                        self._to_xml(child, item)
                else:
                    child = etree.SubElement(parent, k)
                    self._to_xml(child, v)
        else:
            parent.text = str(data) if data is not None else ""

    def get_config_schema(self) -> dict:
        return {"type": "object", "properties": {}}
