"""XML ↔ JSON 互转控件"""

import json
from typing import Optional
import xml.etree.ElementTree as ET
from ...engine.component_base import BaseComponent, register_component


@register_component
class XmlToJsonComponent(BaseComponent):
    component_type = "process"
    component_name = "xml2json"
    display_name = "XML → JSON"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        raw = inputs.get("data", "") if inputs else ""
        xml_str = raw[0] if isinstance(raw, list) and raw else raw
        if not xml_str:
            return {"data": "{}", "rows": 0}

        root = ET.fromstring(xml_str.encode() if isinstance(xml_str, str) else xml_str)
        result = self._to_dict(root)

        return {"data": json.dumps(result, ensure_ascii=False), "rows": 1}

    def _to_dict(self, element) -> dict:
        d = {}
        for child in element:
            d[child.tag] = self._to_dict(child) if len(child) > 0 else child.text
        return d

    def get_config_schema(self) -> dict:
        return {"type": "object", "properties": {}}


@register_component
class JsonToXmlComponent(BaseComponent):
    component_type = "process"
    component_name = "json2xml"
    display_name = "JSON → XML"

    async def execute(self, config: dict, inputs: Optional[dict] = None) -> dict:
        raw = inputs.get("data", "{}") if inputs else "{}"
        data = json.loads(raw) if isinstance(raw, str) else raw

        root = ET.Element("root")
        self._to_xml(root, data)

        result = ET.tostring(root, encoding="unicode", pretty_print=True)
        return {"data": result, "rows": 1}

    def _to_xml(self, parent: ET.Element, data: dict):
        for k, v in data.items():
            child = ET.SubElement(parent, k)
            if isinstance(v, dict):
                self._to_xml(child, v)
            else:
                child.text = str(v) if v is not None else ""

    def get_config_schema(self) -> dict:
        return {"type": "object", "properties": {}}
