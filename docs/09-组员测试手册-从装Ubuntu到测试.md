# 组员手册：从安装 Ubuntu 到部署平台

> 面向组员的完整操作手册。目标：在**你自己电脑**的 VMware 虚拟机里装好 Ubuntu → 部署平台 → 验证平台起来。
> 全程命令行操作，照抄即可。遇到报错先看第六节「常见问题」。
> 端到端测试方法见 `07-端到端集成测试方案.md`，结果记录见 `08-端到端集成测试报告.md`。

---

## 一、准备软件（宿主机 Windows）

1. **VMware Workstation**：VMware Workstation 17 Pro（或 Player，均可）
2. **Ubuntu 自动安装 ISO**：不用自己下官方 ISO，直接找组长拿打好包的 `ubuntu-24.04-autoinstall.iso`（约 2.6GB，群文件/网盘）
   - 想自己从官方 ISO 打包的见 3.4 节

> 说明：选 **Server 版**（无图形界面），省资源、和「银行生产环境」叙事更搭。别下 Desktop 版。

---

## 二、创建虚拟机

VMware 菜单 → 新建虚拟机 → 自定义：

| 项 | 配置 | 说明 |
|---|---|---|
| 客户机操作系统 | Linux / Ubuntu 64 位 | |
| CPU | **8 核** | 赛题要求 |
| 内存 | **32 GB** | 赛题要求；物理机内存不足可降到 24GB（文件批处理场景内存影响很小） |
| 磁盘 | **300 GB**，单个文件 | 赛题要求；机械盘最好（见下注） |
| 网络 | **NAT**（默认） | 让 VM 能上网 + 宿主机能 SSH 进去 |

> ⚠️ **磁盘类型注意**：赛题写「300G 机械硬盘」。如果你的 `.vmdk` 文件放在 SSD 上，测出来就是 SSD 的数字（偏快）。
> 报告里要如实标注磁盘类型。有机械盘分区就把 vmdk 放机械盘上；只有 SSD 就在报告里注明「SSD」。

创建完成后**先别装系统**，去第三章把「自动安装 ISO」准备好，再挂载到虚拟光驱启动。

---

## 三、安装 Ubuntu Server（优先全自动，不用看英文界面）

### 3.1 方式 A：用「自动安装 ISO」（推荐，全程不用看英文界面）

我已经把「无人值守自动安装 ISO」打包好了，直接从群文件、网盘下载：

```
文件名：ubuntu-24.04-autoinstall.iso（约 2.6GB）
```

**第 1 步：VMware 挂载自动安装 ISO**：
VM → 编辑设置 → CD/DVD → 使用 ISO 映像文件 → 选下载的 `ubuntu-24.04-autoinstall.iso` → 确定 → 启动 VM。

**第 2 步：等它自己装**（约 5~10 分钟，**全程不用看屏幕**）：
- 自动完成：语言 en、整盘 LVM 分区、建用户 `ubuntu`（密码 `ubuntu123`）、装好 OpenSSH、apt 已换清华源
- 装完**自动重启**
- 重启后进 VM → 编辑设置 → CD/DVD → **移除 ISO**（避免下次开机又从 ISO 引导）

**装完即是一台「Ubuntu + 已开 SSH」的系统**，直接跳去 3.3 节 SSH 连接。

> 想自己动手打包 ISO 的组员见 3.4（需要 Linux/WSL 环境）。

### 3.2 方式 B：手动安装（兜底，没有自动 ISO 时）

没有自动 ISO 时，也可以下官方 ISO 自己点几下英文界面（约 10 步，2~3 分钟）。启动官方 ISO 后，全程键盘方向键 + 回车：

1. **语言**：English（避免中文编码坑）
2. **键盘**：默认
3. **网络**：自动 DHCP 即可（NAT 下会拿到类似 `192.168.x.x` 的地址）
4. **代理**：留空
5. **镜像源**：默认（慢就选清华源）
6. **磁盘分区**：选 **Use an entire disk**（整个盘），一路默认
7. **用户名**：`ubuntu`，密码 `ubuntu123`
8. **OpenSSH**：**务必勾选 Install OpenSSH server** ← 关键，不装就没法远程登录
9. 其余默认，等装完自动重启

> ⚠️ 无论方式 A/B，最后都要确认能 SSH 登录（见 3.3）。

### 3.3 从宿主机 SSH 连接虚拟机（详细）

**第 1 步：拿到 VM 的 IP**
- 方式一：装完启动后，VM 的登录界面会直接显示本机 IP（在 `ubuntu-sp login:` 上方）；或
- 方式二：在 VM 里登录后执行：
```bash
hostname -I     # 例：192.168.5.135（换成你自己 VM 的地址）
```

**第 2 步：宿主机打开终端**
- 推荐 **Git Bash**（装 Git 时自带）；PowerShell / CMD 也可以。

**第 3 步：连接**（把 IP 换成你自己的）
```bash
ssh ubuntu@192.168.5.135
```

**第 4 步：首次连接确认**
第一次连接会提示 host key 指纹，输入 `yes` 回车：
```
The authenticity of host '192.168.5.135' can't be established.
...
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
```

**第 5 步：输密码**
提示 `ubuntu@192.168.5.135's password:` 时输入 `ubuntu123`。
> ⚠️ 密码输入时**不显示任何字符**（不是卡了），输完直接回车。

**第 6 步：登录成功的标志**
提示符变成 `ubuntu@ubuntu-sp:~$`，说明已进入 VM，后面所有命令都在这里执行。

**连不上？按顺序排查**：

| 现象 | 排查 |
|---|---|
| `ping 192.168.x.x` 不通 | VM 网络模式要是 **NAT**（默认）；VMware NAT 服务没启动则用**管理员** PowerShell 执行 `net start "VMware NAT Service"` |
| ping 通、SSH 拒绝连接 | 装系统时没勾 OpenSSH：VM 里执行 `sudo apt install -y openssh-server` 再试 |
| 提示密码错误 | 注意大小写；输入时不回显，别多敲空格 |
| 一直转圈超时 | VM 网卡没起来，重启 VM 再试 |

**（推荐）配置 SSH 免密**，之后传文件、反复登录都省心：
```bash
# 宿主机执行，输一次密码后以后免密
ssh-copy-id ubuntu@192.168.5.135
ssh ubuntu@192.168.5.135      # 这次不用输密码

# 传文件到 VM：
scp 本地文件 ubuntu@192.168.5.135:~/
```

**多开窗口**：用 Windows Terminal / MobaXterm 多开标签，一个窗口跑部署、一个看日志，别都挤在一个 SSH 里。

### 3.4 附：自己打包自动安装 ISO（可选）

想自己动手的组员用。需要**一个 Linux/WSL 环境**（或任何能跑 bash 的机器），步骤如下：

```bash
# 1. 装打包依赖（只需一次）
sudo apt install -y p7zip-full xorriso isolinux

# 2. 取项目脚本
git clone https://github.com/kadegutou/stream-flow-platform.git
cd stream-platform/scripts/ubuntu-autoinstall

# 3. 打包：把官方 ISO 路径放进参数，产物 ubuntu-24.04-autoinstall.iso
bash make-autoinstall-iso.sh ~/下载/ubuntu-24.04.4-live-server-amd64.iso
```

打包出的 ISO 挂到 VMware 光驱即自动安装（同 3.1）。

---

## 四、一键配置环境（装 Docker + 工具）

SSH 进去后执行（一条命令装好 Docker、Compose 插件、免 sudo、git，并换国内源）：

```bash
# 先取到脚本（若还没 clone 过项目）
git clone https://github.com/kadegutou/stream-flow-platform.git 2>/dev/null || true
cd ~/stream-platform/scripts/ubuntu-autoinstall
bash setup-env.sh
```

跑完会提示**重新登录一次 SSH**（让 docker 免 sudo 生效）。验证：

```bash
docker --version
docker compose version
```

> 脚本里官方源装 Docker 失败会自动改阿里云源；仍失败就手动执行脚本文件里对应命令。

---

## 五、部署平台

### 5.1 获取代码（二选一）

**方式 A：git clone（推荐）**
```bash
git clone https://github.com/kadegutou/stream-flow-platform.git stream-platform
```

**方式 B：宿主机 scp 源码包**（IP 换成 3.3 节查到的你自己的 VM IP）
```bash
# 宿主机执行
scp "项目源码包.zip" ubuntu@<你的VM的IP>:~/
# VM 里解压
unzip ~/项目源码包.zip -d ~/stream-platform
```

### 5.2 一键部署

```bash
cd ~/stream-platform/deploy

# （可选）先配镜像加速，避免拉镜像卡死
bash ../scripts/vm-provision.sh

# 一键构建 + 启动（首次约 10~20 分钟，下载基础镜像 + Maven/npm 依赖）
docker compose up -d --build

# 看状态（应看到 6 个容器：control-plane / worker / frontend / mysql / kafka / redis）
docker compose ps
```

### 5.3 验证平台起来了

```bash
# 登录接口应返回 token
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 或浏览器访问（宿主机浏览器打开）
# http://<VM的IP>/    （前端，账号 admin/admin123）
```

> 若控制面容器反复重启，看日志：`docker compose logs -f control-plane`
> 常见原因：MySQL 还没初始化完（等 30s 自动恢复）；或密钥没配（见第六节）。

---

## 六、常见问题排查

| 现象 | 原因 | 解决 |
|---|---|---|
| 控制面反复重启 | MySQL 未就绪 | 等 30s（compose 有 healthcheck + restart） |
| 作业 FAILED，参数不对 | DAG 参数名写错 | 对照 `07-端到端集成测试方案` 或前端画布里的参数提示核对 |
| 文件路径报「不存在」 | 写了宿主机路径 | 文件路径必须用容器视角 `/data/...` |
| Kafka 连接失败 | 地址写错 | 容器内必须 `kafka:29092`，不是 localhost:9092 |
| 造 100 万行报错 `cte_max_recursion_depth` | MySQL 递归深度默认 1000 | 加 `SET SESSION cte_max_recursion_depth = 2000000;` |
| Kafka 源作业不 STOPPED | 无界流不会自己停 | 数够行数后手动 `offline` |
| 作业卡 STOPPING 删不掉 | 未派发分片就下线（已修复，旧镜像会踩） | 确认 worker 镜像是最新，或用 SQL 清理（见下） |
| 查作业错误原因 | — | `curl -s $BASE/jobs/<id>/instances -H "$AUTH"` + `docker logs stream-platform-worker-1 --tail 50` |

**SQL 强删卡住的作业**（慎用）：

```bash
docker exec -i stream-platform-mysql-1 mysql -uroot -proot123 stream_platform <<'SQL'
DELETE FROM sp_job_shard WHERE instance_id IN (SELECT id FROM sp_job_instance WHERE job_id = <作业ID>);
DELETE FROM sp_job_instance WHERE job_id = <作业ID>;
DELETE FROM sp_job WHERE id = <作业ID>;
SQL
```

---

## 七、资源监控（测试期间同步做）

作业 `online` 后，另开一个 SSH 窗口采样 worker 的 CPU/内存：

```bash
for i in $(seq 1 60); do
  docker stats --no-stream --format "{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}" \
    | grep -E 'worker|control-plane'; sleep 5
done | tee ~/e2e-stats.log
```

记录 worker CPU 峰值、内存峰值（单 worker 限 `-Xmx4g`，内存不应超 4.5GB）
