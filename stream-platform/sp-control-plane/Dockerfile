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
# 国内构建加速：阿里云 Maven 镜像（海外环境可删除此行）
COPY deploy/maven-settings.xml /root/.m2/settings.xml
RUN mvn -B -q -DskipTests dependency:go-offline || true

# 拷贝本模块及其依赖模块源码并构建（-am 连带构建 sp-common、sp-components）
COPY sp-common/ sp-common/
COPY sp-components/ sp-components/
COPY sp-control-plane/ sp-control-plane/
RUN mvn -B -q -DskipTests -pl sp-control-plane -am package

# ---------- 运行阶段 ----------
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/sp-control-plane/target/sp-control-plane-1.0.0.jar app.jar
EXPOSE 8080
# 所有配置均可通过环境变量覆盖（见 deploy/docker-compose.yml）
ENTRYPOINT ["java", "-jar", "app.jar"]
