#!/usr/bin/env bash
# VM 初始化：Docker 镜像加速 + 环境检查（在 VM 内执行）
set -e

echo "=== 1. 配置 Docker 镜像加速 ==="
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "3" }
}
EOF
sudo systemctl restart docker
sleep 3
sudo docker info 2>/dev/null | grep -A3 "Registry Mirrors" || echo "（镜像加速配置已写入，info 未显示属正常）"

echo "=== 2. 环境检查 ==="
docker --version
docker compose version
echo "CPU: $(nproc) 核"
free -h | head -2
df -h / | tail -1

echo "=== 3. 拉取基础镜像（验证网络） ==="
sudo docker pull hello-world && echo "Docker Hub 连通 OK" || echo "!! Docker Hub 拉取失败，需调整镜像源"

echo "=== 完成 ==="
