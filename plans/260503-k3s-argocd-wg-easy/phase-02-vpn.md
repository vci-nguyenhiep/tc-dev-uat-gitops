# Phase 02 — wg-easy VPN

> Bước 1–3 chạy **trên server Linux**. Bước 4–7 chạy **trên máy local của dev**.

---

## [SERVER] Bước 1: Sinh bcrypt password hash

```bash
sudo apt install -y apache2-utils

# Sinh hash (thay "yourpassword")
htpasswd -bnBC 10 "" yourpassword | tr -d ':\n'
# Output: $2y$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Lưu ý khi paste vào docker-compose.yml: dấu `$` phải viết thành `$$`.

## [SERVER] Bước 2: Tạo thư mục và chạy wg-easy

```bash
mkdir -p ~/wg-easy
cp configs/wg-easy/docker-compose.yml ~/wg-easy/docker-compose.yml
cd ~/wg-easy
# Sửa WG_HOST và PASSWORD_HASH trong docker-compose.yml
docker compose up -d
docker compose logs -f
```

## [SERVER] Bước 3: Kiểm tra container

```bash
docker ps | grep wg-easy
```

---

## [LOCAL] Bước 4: Cài WireGuard client trên máy local

### Windows

1. Tải installer tại: [wireguard.com/install](https://www.wireguard.com/install/)
2. Chạy file `.msi`, cài WireGuard for Windows
3. Sau khi cài xong, WireGuard icon xuất hiện ở system tray

### macOS

**Option A — App Store (khuyến nghị):**
- Mở App Store → tìm "WireGuard" → Install

**Option B — Homebrew:**
```bash
brew install wireguard-tools
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y wireguard wireguard-tools
```

**Linux (Arch/Manjaro):**
```bash
sudo pacman -S wireguard-tools
```

---

## [LOCAL] Bước 5: Truy cập wg-easy Web UI để tạo VPN client

Web UI của wg-easy chỉ bind `127.0.0.1:51821` trên server. Cần SSH tunnel để truy cập.

### Windows (dùng PowerShell hoặc Command Prompt)

Windows 10/11 có sẵn OpenSSH:
```powershell
ssh -L 51821:127.0.0.1:51821 USER@SERVER_PUBLIC_IP

ssh -L 51821:127.0.0.1:51821 USER@SERVER_DOMAIN
```

Nếu không có OpenSSH, cài qua Settings → Apps → Optional Features → OpenSSH Client.

**Hoặc dùng PuTTY:**
1. Connection → SSH → Tunnels
2. Source port: `51821`
3. Destination: `127.0.0.1:51821`
4. Click Add → Open

### macOS

```bash
ssh -L 51821:127.0.0.1:51821 USER@SERVER_PUBLIC_IP
```

### Linux

```bash
ssh -L 51821:127.0.0.1:51821 USER@SERVER_PUBLIC_IP
```

---

Sau khi SSH tunnel đang chạy, mở trình duyệt: `http://localhost:51821` hoặc `http://10.8.0.1:51821/`

1. Đăng nhập bằng password đã cấu hình
2. Click **New Client** → đặt tên (ví dụ: `win-laptop`, `mac-work`)
3. Download file `.conf`

---

## [LOCAL] Bước 6: Import và bật VPN

### Windows

1. Mở WireGuard for Windows
2. Click **Import tunnel(s) from file**
3. Chọn file `.conf` vừa download
4. Click **Activate**

Verify (PowerShell):
```powershell
# Kiểm tra IP VPN
ipconfig | findstr "10.8.0"
# Phải thấy 10.8.0.x
ping 10.8.0.1
```

### macOS

**Dùng WireGuard App (App Store):**
1. Mở WireGuard app
2. Click `+` → Import tunnel(s) from file
3. Chọn file `.conf`
4. Toggle để bật

**Hoặc dùng CLI (wireguard-tools):**
```bash
sudo wg-quick up ~/Downloads/my-laptop.conf
# Verify
ping 10.8.0.1
```

Tắt VPN:
```bash
sudo wg-quick down ~/Downloads/my-laptop.conf
```

### Linux

```bash
# Copy conf vào đúng thư mục
sudo cp ~/Downloads/my-laptop.conf /etc/wireguard/wg0.conf

# Bật VPN
sudo wg-quick up wg0

# Tự động bật khi boot
sudo systemctl enable wg-quick@wg0

# Kiểm tra
ip addr show wg0
ping 10.8.0.1
```

Tắt VPN:
```bash
sudo wg-quick down wg0
```

---

## [SERVER] Bước 7: Khóa SSH public sau khi VPN hoạt động

> ⚠️ Chỉ chạy sau khi đã test thành công `ssh USER@10.8.0.1` qua VPN — nếu không sẽ bị khoá ngoài server.

Xem rule SSH hiện tại đang dùng tên gì:

```bash
sudo ufw status numbered
```

Tuỳ rule là `22` hay `22/tcp` mà chọn cách xoá tương ứng.

**Cách an toàn nhất — xoá theo số thứ tự** (xoá từ số to → số nhỏ để tránh index lệch):

```bash
# Tìm số của rule "22" (v4) và "22 (v6)" trong output `ufw status numbered` ở trên
# Ví dụ rule v4 là [1], v6 là [6]:
sudo ufw delete 6
sudo ufw delete 1

sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp
sudo ufw status verbose
```

**Cách dùng rule string** (phải khớp chính xác cách rule được tạo):

```bash
# Nếu rule hiển thị là "22" (không có /tcp):
sudo ufw delete allow 22

# Nếu rule hiển thị là "22/tcp":
sudo ufw delete allow 22/tcp

sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp
sudo ufw status verbose
```

---

## Verify toàn bộ

| Kiểm tra | Kết quả mong đợi |
|---|---|
| `ping 10.8.0.1` (máy local, VPN bật) | Reply từ server |
| `ssh USER@10.8.0.1` (qua VPN) | SSH vào được |
| `ssh USER@SERVER_PUBLIC_IP` (sau khi lock) | Connection refused |
| `curl https://ifconfig.me` (qua full-tunnel VPN) | IP của server |
