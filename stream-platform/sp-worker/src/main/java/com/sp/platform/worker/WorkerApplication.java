package com.sp.platform.worker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Worker 入口（端口 8081）：注册、心跳拉任务、执行引擎、上报指标。对应设计文档 §2 数据面。 */
@EnableScheduling
@SpringBootApplication
public class WorkerApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorkerApplication.class, args);
    }
}
