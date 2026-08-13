package com.sp.platform.control.web;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * P0-1 越权访问测试：普通用户操作他人作业的 6 个端点全部 403；
 * 本人与 ADMIN 可访问；非 ADMIN 调用户写接口被拒。
 */
@SpringBootTest
@AutoConfigureMockMvc
class JobControllerAuthTest {

    private static final String DAG = """
            {"nodes":[
              {"id":"n1","componentCode":"csv-source","params":{"path":"/tmp/a.csv"}},
              {"id":"n2","componentCode":"field-concat","params":{"sourceFields":["a"],"targetField":"b"}},
              {"id":"n3","componentCode":"csv-sink","params":{"path":"/tmp/b.csv"}}],
             "edges":[{"from":"n1","to":"n2"},{"from":"n2","to":"n3"}]}
            """;

    @Autowired
    private MockMvc mvc;

    private String adminToken;
    private String aliceToken;
    private String bobToken;
    private long aliceJobId;

    @BeforeEach
    void setUp() throws Exception {
        adminToken = login("admin", "admin123");
        ensureUser("alice");
        ensureUser("bob");
        aliceToken = login("alice", "pw12345");
        bobToken = login("bob", "pw12345");
        // alice 创建一个作业
        MvcResult r = mvc.perform(post("/api/jobs")
                        .header("Authorization", "Bearer " + aliceToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"alice-job\",\"parallelism\":1,\"dag\":" + DAG + "}"))
                .andExpect(status().isOk())
                .andReturn();
        aliceJobId = extractId(r.getResponse().getContentAsString());
    }

    @Test
    void bobCannotTouchAlicesJob() throws Exception {
        String bob = "Bearer " + bobToken;
        mvc.perform(get("/api/jobs/" + aliceJobId).header("Authorization", bob))
                .andExpect(status().isForbidden());
        mvc.perform(put("/api/jobs/" + aliceJobId).header("Authorization", bob)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"hacked\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/jobs/" + aliceJobId).header("Authorization", bob))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/jobs/" + aliceJobId + "/online").header("Authorization", bob))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/jobs/" + aliceJobId + "/offline").header("Authorization", bob))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/jobs/" + aliceJobId + "/instances").header("Authorization", bob))
                .andExpect(status().isForbidden());
    }

    @Test
    void ownerAndAdminCanAccess() throws Exception {
        mvc.perform(get("/api/jobs/" + aliceJobId)
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk());
        mvc.perform(get("/api/jobs/" + aliceJobId + "/instances")
                        .header("Authorization", "Bearer " + aliceToken))
                .andExpect(status().isOk());
        mvc.perform(get("/api/jobs/" + aliceJobId)
                        .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());
    }

    @Test
    void nonAdminCannotWriteUsers() throws Exception {
        String bob = "Bearer " + bobToken;
        mvc.perform(post("/api/users").header("Authorization", bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"x\",\"password\":\"y12345\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/users/1").header("Authorization", bob))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/users").header("Authorization", bob))
                .andExpect(status().isForbidden());
    }

    @Test
    void noTokenRejected() throws Exception {
        mvc.perform(get("/api/jobs")).andExpect(status().isUnauthorized());
    }

    @Test
    void bobListDoesNotContainAlicesJob() throws Exception {
        MvcResult r = mvc.perform(get("/api/jobs")
                        .header("Authorization", "Bearer " + bobToken))
                .andExpect(status().isOk()).andReturn();
        assertTrue(!r.getResponse().getContentAsString().contains("alice-job"));
    }

    private void ensureUser(String username) throws Exception {
        mvc.perform(post("/api/users")
                        .header("Authorization", "Bearer " + adminToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username
                                + "\",\"password\":\"pw12345\",\"role\":\"USER\"}"))
                .andReturn(); // 已存在则 409，忽略
    }

    private String login(String username, String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk()).andReturn();
        String body = r.getResponse().getContentAsString();
        String token = body.replaceAll(".*\"token\":\"([^\"]+)\".*", "$1");
        assertTrue(token.length() > 20, "登录应返回 JWT: " + body);
        return token;
    }

    private static long extractId(String json) {
        return Long.parseLong(json.replaceAll(".*\"id\":(\\d+).*", "$1"));
    }
}
