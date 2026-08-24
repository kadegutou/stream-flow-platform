#!/usr/bin/env bash
# 把官方 Ubuntu Server ISO 改造成「无人值守自动安装」ISO（基于 autoinstall / subiquity）。
#
# 用法（需在 Ubuntu / WSL / 任意 Linux 环境执行，每个 ISO 只需做一次）：
#   bash make-autoinstall-iso.sh /path/to/ubuntu-24.04.x-live-server-amd64.iso [输出.iso]
#
# 依赖（Ubuntu 里先装一次）：sudo apt install -y p7zip-full xorriso isolinux
#
# 产物 ISO 挂到 VMware 光驱后开机即全自动安装，无需看英文界面：
#   en 语言 / 整盘 LVM / 用户 ubuntu:ubuntu123 / 已装 OpenSSH / apt 已换清华源
set -euo pipefail

ISO="${1:?用法: bash make-autoinstall-iso.sh <官方ISO路径> [输出ISO路径]}"
OUT="${2:-ubuntu-24.04-autoinstall.iso}"
DIR="$(cd "$(dirname "$0")" && pwd)"

# ---- 依赖检查 ----
for c in 7z xorriso; do
  command -v "$c" >/dev/null || { echo "缺少 $c：先运行 sudo apt install -y p7zip-full xorriso"; exit 1; }
done
[ -f /usr/lib/ISOLINUX/isohdpfx.bin ] || { echo "缺少 isolinux：先运行 sudo apt install -y isolinux"; exit 1; }
[ -f "$ISO" ] || { echo "找不到官方 ISO: $ISO"; exit 1; }

WORK="$(mktemp -d)"
SRC="$WORK/src"
trap 'rm -rf "$WORK"' EXIT

echo "==> [1/4] 解压官方 ISO ..."
7z x -y "$ISO" -o"$SRC" >/dev/null

echo "==> [2/4] 注入 autoinstall 用户数据 ..."
mkdir -p "$SRC/autoinstall"
cp "$DIR/user-data" "$SRC/autoinstall/user-data"
# meta-data 是 nocloud 数据源的必需文件（instance-id 仅需唯一）
echo "instance-id: $(date +%s)" > "$SRC/autoinstall/meta-data"

echo "==> [3/4] 向引导参数注入 autoinstall 指令 ..."
# 内核追加 autoinstall + nocloud 数据源（指向 /cdrom/autoinstall/）
# grub 的 linux 行（EFI）与 isolinux 的 append 行（BIOS）都改，双覆盖
sed -i 's#^\(.*/casper/vmlinuz.*\)#\1 autoinstall ds=nocloud\\;s=/cdrom/autoinstall/#' "$SRC/boot/grub/grub.cfg"
sed -i 's#^\(.*append .*\)#\1 autoinstall ds=nocloud\\;s=/cdrom/autoinstall/#' "$SRC/isolinux/isolinux.cfg" 2>/dev/null || true
if ! grep -q 'autoinstall' "$SRC/boot/grub/grub.cfg"; then
  echo "错误：未能向 grub.cfg 注入 autoinstall 参数（ISO 结构不符预期，请检查 ISO 版本）"
  exit 1
fi

echo "==> [4/4] 重新打包 ISO ..."
xorriso -as mkisofs -o "$OUT" \
  -isohybrid-mbr /usr/lib/ISOLINUX/isohdpfx.bin \
  -c isolinux/boot.cat -b isolinux/isolinux.bin -no-emul-boot \
  -boot-load-size 4 -boot-info-table \
  -eltorito-alt-boot -e boot/grub/efi.img -no-emul-boot \
  -isohybrid-gpt-basdat \
  -V "Ubuntu-Server-24.04-AUTO" \
  "$SRC" >/dev/null

echo "==> 完成：$(pwd)/$OUT"
echo "下一步：VMware 光驱挂载该 ISO → 开机 → 等约 5~10 分钟全自动装完自动重启"
echo "        → 用 ssh ubuntu@<IP> 登录（密码 ubuntu123）"
