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

## Bước 4.1: Bật IP forwarding cho WireGuard

Vì wg-easy chạy `network_mode: host`, sysctls phải set trên host (Docker không cho set namespaced sysctls trong host network namespace).

```bash
sudo tee /etc/sysctl.d/99-wireguard.conf > /dev/null <<'EOF'
net.ipv4.ip_forward = 1
net.ipv4.conf.all.src_valid_mark = 1
EOF

sudo sysctl --system

# Verify
sysctl net.ipv4.ip_forward
sysctl net.ipv4.conf.all.src_valid_mark
# Cả hai phải = 1
```

## Bước 5: Cấu hình UFW

### 5.1 Cho phép FORWARD (bắt buộc cho VPN client ra Internet)

UFW mặc định DROP gói FORWARD → VPN client active sẽ KHÔNG ra được Internet. Phải đổi sang ACCEPT:

```bash
sudo sed -i 's/DEFAULT_FORWARD_POLICY="DROP"/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw

# Verify
grep DEFAULT_FORWARD_POLICY /etc/default/ufw
# Phải thấy: DEFAULT_FORWARD_POLICY="ACCEPT"
```

### 5.2 Khai báo rule UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Public web
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# WireGuard VPN
sudo ufw allow 51820/udp

# SSH backup port — mở internet, dùng khi wg-easy sập
sudo ufw allow 2269/tcp comment "SSH backup internet"

# SSH port 22 — chỉ từ VPN (sau khi VPN hoạt động mới bật)
# sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp
# sudo ufw deny 22/tcp

# Kubernetes API chỉ từ VPN
sudo ufw allow from 10.8.0.0/24 to any port 6443 proto tcp

sudo ufw enable
sudo ufw status verbose
```

> **Nếu UFW đã enable từ trước** mà mới đổi `DEFAULT_FORWARD_POLICY`, phải reload để áp dụng:
> ```bash
> sudo ufw disable && sudo ufw enable
> ```

---

### 5.3 Cấu hình SSH 2 port (backup khi wg-easy sập)

**Lý do:** wg-easy đôi khi bị sập → mất SSH qua VPN → không vào được server để fix.
**Giải pháp:** SSH lắng nghe 2 port — port 22 chỉ VPN, port 2269 mở internet.

```bash
# Thêm port 2269 vào sshd_config (giữ nguyên port 22)
sudo sed -i '/^#Port 22/a Port 22\nPort 2269' /etc/ssh/sshd_config
# Hoặc mở file và thêm thủ công:
# sudo nano /etc/ssh/sshd_config
# → Thêm 2 dòng:
#   Port 22
#   Port 2269

sudo systemctl restart sshd

# Verify 2 port đang listen
sudo ss -tlnp | grep sshd
# LISTEN  0.0.0.0:22    ← VPN only (UFW chặn từ internet)
# LISTEN  0.0.0.0:2269  ← internet backup
```

Test từ máy local **(mở session mới, KHÔNG đóng session cũ)**:
```bash
ssh -p 2269 user@SERVER_PUBLIC_IP
```

Sau khi VPN hoạt động, khóa port 22 về VPN-only:
```bash
sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp
sudo ufw deny 22/tcp
```

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
