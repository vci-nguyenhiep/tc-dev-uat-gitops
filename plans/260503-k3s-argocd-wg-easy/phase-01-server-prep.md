# Phase 01 — Server Preparation

## Yêu cầu
- Ubuntu Server 22.04 LTS
- Public IP tĩnh
- Domain đã trỏ A record về IP server

## Bước 1: Cập nhật hệ thống

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git vim htop net-tools ufw
```

## Bước 2: Cấu hình hostname

```bash
sudo hostnamectl set-hostname k3s-server
```

## Bước 3: Cấu hình timezone

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
timedatectl status
```

## Bước 4: Cài Docker + Docker Compose (cho wg-easy)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker --version
```

## Bước 5: Cấu hình UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Public web
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# WireGuard VPN
sudo ufw allow 51820/udp

# SSH chỉ từ VPN (sau khi VPN hoạt động mới bật rule này)
# sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp

# Kubernetes API chỉ từ VPN
sudo ufw allow from 10.8.0.0/24 to any port 6443 proto tcp

sudo ufw enable
sudo ufw status verbose
```

> **Lưu ý**: Tạm thời giữ SSH public trong lúc setup.
> Sau khi VPN hoạt động và test SSH qua VPN thành công, mới khóa SSH về VPN-only:
> ```bash
> sudo ufw delete allow 22/tcp
> sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp
> ```

## Bước 6: Trỏ DNS

Tạo các A record sau về IP public của server:

```
vpn.company.com       → <PUBLIC_IP>
argocd.company.com    → <PUBLIC_IP>
grafana.company.com   → <PUBLIC_IP>
uptime.company.com    → <PUBLIC_IP>
dev-app.company.com   → <PUBLIC_IP>
dev-api.company.com   → <PUBLIC_IP>
uat-app.company.com   → <PUBLIC_IP>
uat-api.company.com   → <PUBLIC_IP>
app.company.com       → <PUBLIC_IP>
api.company.com       → <PUBLIC_IP>
```

## Verify

```bash
# Kiểm tra UFW
sudo ufw status

# Kiểm tra Docker
docker ps

# Kiểm tra DNS (từ máy local)
nslookup vpn.company.com
```
