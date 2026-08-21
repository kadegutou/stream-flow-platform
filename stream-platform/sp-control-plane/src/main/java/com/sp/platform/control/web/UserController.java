package com.sp.platform.control.web;

import com.sp.platform.control.entity.SysUser;
import com.sp.platform.control.repo.SysUserRepo;
import com.sp.platform.control.security.AuthFilters.JwtAuthFilter;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 用户 CRUD（仅 ADMIN）。对应设计文档 §4.1。 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final SysUserRepo userRepo;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public UserController(SysUserRepo userRepo) {
        this.userRepo = userRepo;
    }

    private static void requireAdmin(HttpServletRequest req) {
        if (!"ADMIN".equals(req.getAttribute(JwtAuthFilter.ATTR_ROLE))) {
            throw ApiExceptionHandler.ApiException.forbidden("仅管理员可操作");
        }
    }

    private static Map<String, Object> toView(SysUser u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("nickname", u.getNickname());
        m.put("role", u.getRole());
        m.put("status", u.getStatus());
        m.put("createdAt", u.getCreatedAt());
        m.put("updatedAt", u.getUpdatedAt());
        return m;
    }

    @GetMapping
    public List<Map<String, Object>> list(HttpServletRequest req) {
        requireAdmin(req);
        return userRepo.findAll().stream().map(UserController::toView).toList();
    }

    @PostMapping
    public Map<String, Object> create(@RequestBody Map<String, Object> body, HttpServletRequest req) {
        requireAdmin(req);
        String username = str(body, "username", true);
        String password = str(body, "password", true);
        if (userRepo.findByUsername(username).isPresent()) {
            throw ApiExceptionHandler.ApiException.conflict("用户名已存在: " + username);
        }
        SysUser u = new SysUser();
        u.setUsername(username);
        u.setPasswordHash(encoder.encode(password));
        u.setNickname(str(body, "nickname", false));
        u.setRole(body.get("role") == null ? "USER" : String.valueOf(body.get("role")));
        return toView(userRepo.save(u));
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable Long id, @RequestBody Map<String, Object> body,
                                      HttpServletRequest req) {
        requireAdmin(req);
        SysUser u = userRepo.findById(id)
                .orElseThrow(() -> ApiExceptionHandler.ApiException.notFound("用户不存在: " + id));
        if (body.get("nickname") != null) {
            u.setNickname(String.valueOf(body.get("nickname")));
        }
        if (body.get("role") != null) {
            u.setRole(String.valueOf(body.get("role")));
        }
        if (body.get("status") != null) {
            u.setStatus(((Number) body.get("status")).intValue());
        }
        if (body.get("password") != null && !String.valueOf(body.get("password")).isBlank()) {
            u.setPasswordHash(encoder.encode(String.valueOf(body.get("password"))));
        }
        return toView(userRepo.save(u));
    }

    @DeleteMapping("/{id}")
    public Map<String, Object> delete(@PathVariable Long id, HttpServletRequest req) {
        requireAdmin(req);
        if (!userRepo.existsById(id)) {
            throw ApiExceptionHandler.ApiException.notFound("用户不存在: " + id);
        }
        userRepo.deleteById(id);
        return Map.of("ok", true);
    }

    private static String str(Map<String, Object> body, String key, boolean required) {
        Object v = body.get(key);
        if (v == null || String.valueOf(v).isBlank()) {
            if (required) {
                throw ApiExceptionHandler.ApiException.badRequest("缺少参数: " + key);
            }
            return null;
        }
        return String.valueOf(v);
    }
}
