package com.sp.platform.control.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/** 统一异常 → JSON 错误响应。 */
@RestControllerAdvice
public class ApiExceptionHandler {

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

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> internal(Exception e) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", String.valueOf(e.getMessage())));
    }
}
