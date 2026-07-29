package com.sp.platform.control.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sp.platform.control.entity.ComponentDefEntity;
import com.sp.platform.control.repo.ComponentDefRepo;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 控件注册表查询。对应设计文档 §4.2。 */
@RestController
@RequestMapping("/api/components")
public class ComponentController {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ComponentDefRepo componentRepo;

    public ComponentController(ComponentDefRepo componentRepo) {
        this.componentRepo = componentRepo;
    }

    /** GET /api/components → [{id,code,name,category,description,icon,paramSchema}] */
    @GetMapping
    public List<Map<String, Object>> list() {
        return componentRepo.findAll().stream().map(c -> {
            Map<String, Object> m = new LinkedHashMap<String, Object>();
            m.put("id", c.getId());
            m.put("code", c.getCode());
            m.put("name", c.getName());
            m.put("category", c.getCategory());
            m.put("description", c.getDescription());
            m.put("icon", c.getIcon());
            try {
                m.put("paramSchema", MAPPER.readValue(c.getParamSchema(), Object.class));
            } catch (Exception e) {
                m.put("paramSchema", c.getParamSchema());
            }
            return m;
        }).toList();
    }
}
