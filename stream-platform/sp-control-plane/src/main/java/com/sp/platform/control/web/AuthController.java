package com.sp.platform.control.web;

import com.sp.platform.control.entity.SysUser;
import com.sp.platform.control.repo.SysUserRepo;
import com.sp.platform.control.security.JwtService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 登录认证。 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final SysUserRepo userRepo;
    private final JwtService jwtService;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthController(SysUserRepo userRepo, JwtService jwtService) {
        this.userRepo = userRepo;
        this.jwtService = jwtService;
    }

    /** POST /api/auth/login {username,password} → {token,nickname,role} */
    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> body) {
        String username = String.valueOf(body.getOrDefault("username", ""));
        String password = String.valueOf(body.getOrDefault("password", ""));
        SysUser user = userRepo.findByUsername(username)
                .orElseThrow(() -> ApiExceptionHandler.ApiException.badRequest("用户名或密码错误"));
        if (user.getStatus() != 1 || !encoder.matches(password, user.getPasswordHash())) {
            throw ApiExceptionHandler.ApiException.badRequest("用户名或密码错误");
        }
        return Map.of(
                "token", jwtService.issue(user.getId(), user.getUsername(), user.getRole()),
                "nickname", user.getNickname() == null ? user.getUsername() : user.getNickname(),
                "role", user.getRole());
    }

    /** POST /api/auth/register {username,password,nickname} → {token,nickname,role} */
    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, Object> body) {
        String username = String.valueOf(body.getOrDefault("username", "")).trim();
        String password = String.valueOf(body.getOrDefault("password", ""));
        String nickname = String.valueOf(body.getOrDefault("nickname", "")).trim();
        if (username.isEmpty() || password.isEmpty()) {
            throw ApiExceptionHandler.ApiException.badRequest("用户名和密码不能为空");
        }
        if (username.length() > 64) {
            throw ApiExceptionHandler.ApiException.badRequest("用户名过长");
        }
        if (userRepo.findByUsername(username).isPresent()) {
            throw ApiExceptionHandler.ApiException.conflict("用户名已存在");
        }
        SysUser u = new SysUser();
        u.setUsername(username);
        u.setPasswordHash(encoder.encode(password));
        u.setNickname(nickname.isEmpty() ? username : nickname);
        u.setRole("USER");
        userRepo.save(u);
        return Map.of(
                "token", jwtService.issue(u.getId(), u.getUsername(), u.getRole()),
                "nickname", u.getNickname(),
                "role", u.getRole());
    }
}
