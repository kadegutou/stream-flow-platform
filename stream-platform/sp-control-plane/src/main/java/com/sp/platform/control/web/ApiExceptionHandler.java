package com.sp.platform.control.web;

import jakarta.persistence.OptimisticLockException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** 统一异常 → JSON 错误响应。 */
@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    public static class ApiException extends RuntimeException {
        private final int status;

        public ApiException(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() { return status; }

        public static ApiException badRequest(String msg) { return new ApiException(400, msg); }
        public static ApiException notFound(String msg) { return new ApiException(404, msg); }
        public static ApiException forbidden(String msg) { return new ApiException(403, msg); }
        public static ApiException conflict(String msg) { return new ApiException(409, msg); }
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> badRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }

    /** 乐观锁冲突（并发更新同一作业）→ 409，提示客户端重试。 */
    @ExceptionHandler(OptimisticLockException.class)
    public ResponseEntity<Map<String, Object>> optimisticLock(OptimisticLockException e) {
        log.warn("乐观锁冲突: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "数据已被其他操作修改，请刷新后重试"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> internal(Exception e) {
        log.error("未处理异常", e); // 服务端留痕，避免线上故障无法排查
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "服务器内部错误"));
    }
}
