# ---------- 构建阶段 ----------
# 注意：构建上下文必须是工程根目录（本模块依赖 sp-common / sp-components）
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# 先只拷贝 pom，利用 Docker 层缓存：pom 不变则不重新解析依赖
COPY pom.xml ./
COPY sp-common/pom.xml sp-common/
COPY sp-components/pom.xml sp-components/
COPY sp-control-plane/pom.xml sp-control-plane/
COPY sp-worker/pom.xml sp-worker/
RUN mvn -B -q -DskipTests dependency:go-offline || true

# 拷贝本模块及其依赖模块源码并构建（-am 连带构建 sp-common、sp-components）
COPY sp-common/ sp-common/
COPY sp-components/ sp-components/
COPY sp-worker/ sp-worker/
RUN mvn -B -q -DskipTests -pl sp-worker -am package

# ---------- 运行阶段 ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/sp-worker/target/sp-worker-1.0.0.jar app.jar
EXPOSE 8081
# 关键环境变量：sp.control-plane-url（SPRING_APPLICATION_JSON 注入）、WORKER_NODE_CODE
ENTRYPOINT ["java", "-jar", "app.jar"]
