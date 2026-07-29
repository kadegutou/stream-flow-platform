package com.sp.platform.control.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/** 认证过滤器：/api/worker/** 走共享密钥头，其余 /api/** 走 JWT。 */
public final class AuthFilters {

    private AuthFilters() {
    }

    static void writeError(HttpServletResponse resp, int status, String msg) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.getWriter().write("{\"error\":\"" + msg + "\"}");
    }

    /** Worker 内部接口：X-Worker-Token 共享密钥校验（配置化，默认 dev-token），不走 JWT。 */
    @Component
    @Order(1)
    public static class WorkerTokenFilter extends OncePerRequestFilter {

        private final String workerToken;

        public WorkerTokenFilter(@Value("${sp.worker-token:dev-token}") String workerToken) {
            this.workerToken = workerToken;
        }

        @Override
        protected boolean shouldNotFilter(HttpServletRequest request) {
            return !request.getRequestURI().startsWith("/api/worker/");
        }

        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp, FilterChain chain)
                throws ServletException, IOException {
            if (!workerToken.equals(req.getHeader("X-Worker-Token"))) {
                writeError(resp, 401, "invalid worker token");
                return;
            }
            chain.doFilter(req, resp);
        }
    }

    /** 用户接口：JWT 校验。通过后把 uid/username/role 放入 request attribute。 */
    @Component
    @Order(2)
    public static class JwtAuthFilter extends OncePerRequestFilter {

        public static final String ATTR_UID = "authUid";
        public static final String ATTR_USERNAME = "authUsername";
        public static final String ATTR_ROLE = "authRole";

        private final JwtService jwtService;

        public JwtAuthFilter(JwtService jwtService) {
            this.jwtService = jwtService;
        }

        @Override
        protected boolean shouldNotFilter(HttpServletRequest request) {
            String uri = request.getRequestURI();
            return !uri.startsWith("/api/")
                    || uri.startsWith("/api/auth/")
                    || uri.startsWith("/api/worker/");
        }

        @Override
        protected void doFilterInternal(HttpServletRequest req, HttpServletResponse resp, FilterChain chain)
                throws ServletException, IOException {
            String header = req.getHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                writeError(resp, 401, "missing token");
                return;
            }
            try {
                Claims claims = jwtService.parse(header.substring(7));
                Object uid = claims.get("uid");
                Long uidLong = uid instanceof Number n ? n.longValue()
                        : Long.valueOf(String.valueOf(uid));
                req.setAttribute(ATTR_UID, uidLong);
                req.setAttribute(ATTR_USERNAME, claims.getSubject());
                req.setAttribute(ATTR_ROLE, claims.get("role", String.class));
                chain.doFilter(req, resp);
            } catch (Exception e) {
                writeError(resp, 401, "invalid token");
            }
        }
    }
}
