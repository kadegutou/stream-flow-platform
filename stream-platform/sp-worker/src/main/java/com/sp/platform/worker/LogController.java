package com.sp.platform.worker;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Worker 在线日志：GET /logs/tail?lines=200（X-Worker-Token 鉴权，读日志文件尾部）。 */
@RestController
public class LogController {

    private final String workerToken;
    private final String logFile;

    public LogController(@Value("${sp.worker-token:dev-token}") String workerToken,
                         @Value("${logging.file.name:logs/worker.log}") String logFile) {
        this.workerToken = workerToken;
        this.logFile = logFile;
    }

    @GetMapping("/logs/tail")
    public ResponseEntity<String> tail(@RequestParam(defaultValue = "200") int lines,
                                       @RequestHeader(value = "X-Worker-Token", required = false) String token) {
        if (!workerToken.equals(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("invalid worker token");
        }
        Path path = Path.of(logFile);
        if (!Files.exists(path)) {
            return ResponseEntity.ok("(日志文件不存在: " + path.toAbsolutePath() + ")");
        }
        try {
            List<String> all = Files.readAllLines(path, StandardCharsets.UTF_8);
            int from = Math.max(0, all.size() - Math.min(lines, 2000));
            List<String> tail = new ArrayList<>(all.subList(from, all.size()));
            return ResponseEntity.ok(String.join("\n", tail));
        } catch (IOException e) {
            return ResponseEntity.internalServerError().body("读取日志失败: " + e.getMessage());
            // 说明：读全文件再截尾，日志量大时可优化为反向读取；Worker 日志按天滚动前够用
        }
    }
}
