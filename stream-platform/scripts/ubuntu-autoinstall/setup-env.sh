#!/usr/bin/env bash
# 平台运行环境一键配置（装完 Ubuntu 后 SSH 进去执行一次）：
#   装 Docker + Compose 插件 / 免 sudo / Git / 常用工具 / 建数据目录
# 用法：bash setup-env.sh
set -e

echo "==> [1/5] 换 apt 国内源（清华，加速后续安装）"
if [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then
  sudo sed -i 's|http://archive.ubuntu.com|https://mirrors.tuna.tsinghua.edu.cn|g; s|http://security.ubuntu.com|https://mirrors.tuna.tsinghua.edu.cn|g' \
    /etc/apt/sources.list.d/ubuntu.sources || true
  sudo apt update -o Acquire::Retries=3
fi

echo "==> [2/5] 安装 Docker（官方脚本，失败自动改阿里云源）"
if ! command -v docker >/dev/null 2>&1; then
  (curl -fsSL https://get.docker.com | sudo sh) || {
    echo "官方源失败，改用阿里云源 ..."
    curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg \
      | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
      | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
    sudo apt update -o Acquire::Retries=3
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  }
fi
sudo systemctl enable --now docker

echo "==> [3/5] 免 sudo 用 docker"
sudo usermod -aG docker "$USER"

echo "==> [4/5] 安装 Git 与解压工具"
sudo apt install -y git unzip python3

echo "==> [5/5] 建数据目录 + 验证"
mkdir -p ~/sp-data/bench
docker --version && docker compose version

echo ""
echo "全部完成。请重新登录一次 SSH（或执行 newgrp docker）后，docker 不再需要 sudo。"
echo "注意：当前用户已加入 docker 组，但需重开终端/重连才生效。"
