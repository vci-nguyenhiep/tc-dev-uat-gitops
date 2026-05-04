# Phase 03 — k3s + k9s

> Bước 1–3 chạy **trên server Linux**. Bước 4–6 chạy **trên máy local của dev**.

---

## [SERVER] Bước 1: Cài k3s

```bash
curl -sfL https://get.k3s.io | sh -
```

Kiểm tra sau khi cài:

```bash
sudo kubectl get nodes
sudo kubectl get pods -A
```

Node phải ở trạng thái `Ready`. Các pod trong `kube-system` phải `Running`.

## [SERVER] Bước 2: Tạo alias tiện lợi

```bash
echo 'alias k=kubectl' >> ~/.bashrc
echo 'alias kns="kubectl config set-context --current --namespace"' >> ~/.bashrc
source ~/.bashrc
```

## [SERVER] Bước 3: Tạo namespace

Dùng file declarative thay vì `kubectl create` — có label sẵn cho NetworkPolicy:

```bash
kubectl apply -f configs/namespaces/namespaces.yaml
```

Verify:

```bash
kubectl get namespaces --show-labels
# NAME           STATUS   LABELS
# dev            Active   env=dev,kubernetes.io/metadata.name=dev,...
# uat            Active   env=uat,kubernetes.io/metadata.name=uat,...
# data           Active   kubernetes.io/metadata.name=data,...
# ...
```

> **Tại sao cần label?** NetworkPolicy dùng `namespaceSelector` để xác định namespace.
> Label `kubernetes.io/metadata.name` tự được thêm bởi Kubernetes 1.21+,
> nhưng khai báo rõ trong YAML giúp dễ đọc và tránh nhầm lẫn.

---

## [LOCAL] Bước 4: Cài kubectl trên máy local

### Windows

**Option A — winget (Windows 10/11):**
```powershell
winget install Kubernetes.kubectl
```

**Option B — Chocolatey:**
```powershell
choco install kubernetes-cli
```

**Option C — Download thủ công:**
```powershell
# PowerShell (chạy với quyền Admin)
$version = (Invoke-RestMethod "https://dl.k8s.io/release/stable.txt").Trim()
Invoke-WebRequest -Uri "https://dl.k8s.io/release/$version/bin/windows/amd64/kubectl.exe" -OutFile kubectl.exe
Move-Item kubectl.exe C:\Windows\System32\kubectl.exe
```

Verify:
```powershell
kubectl version --client
```

### macOS

```bash
brew install kubectl
```

Verify:
```bash
kubectl version --client
```

### Linux (Ubuntu/Debian)

```bash
sudo snap install kubectl --classic
```

Hoặc:
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
```

Verify:
```bash
kubectl version --client
```

---

## [LOCAL] Bước 5: Lấy kubeconfig từ server và cấu hình máy local

### 5.1 Lấy kubeconfig từ server (bật VPN trước)

```bash
# SSH vào server qua VPN
ssh USER@10.8.0.1
sudo cat /etc/rancher/k3s/k3s.yaml
```

Copy toàn bộ nội dung YAML.

---

### 5.2 Lưu kubeconfig — Windows

```powershell
# Tạo thư mục .kube
New-Item -ItemType Directory -Force -Path "$HOME\.kube"

# Tạo file kubeconfig
notepad "$HOME\.kube\company-k3s.yaml"
# Paste nội dung kubeconfig vào, Save
```

Sửa dòng `server` trong file:
```yaml
# Tìm:
server: https://127.0.0.1:6443

# Sửa thành:
server: https://10.8.0.1:6443
```

Set environment variable (PowerShell — chỉ cho session hiện tại):
```powershell
$env:KUBECONFIG = "$HOME\.kube\company-k3s.yaml"
kubectl get nodes
```

Set permanent (PowerShell):
```powershell
[System.Environment]::SetEnvironmentVariable("KUBECONFIG", "$HOME\.kube\company-k3s.yaml", "User")
# Restart terminal để có hiệu lực
```

---

### 5.2 Lưu kubeconfig — macOS

```bash
mkdir -p ~/.kube
vim ~/.kube/company-k3s.yaml
# Paste nội dung kubeconfig, sửa server → https://10.8.0.1:6443
```

Set KUBECONFIG permanent (thêm vào `~/.zshrc` hoặc `~/.bash_profile`):
```bash
echo 'export KUBECONFIG=~/.kube/company-k3s.yaml' >> ~/.zshrc
source ~/.zshrc
```

---

### 5.2 Lưu kubeconfig — Linux

```bash
mkdir -p ~/.kube
nano ~/.kube/company-k3s.yaml
# Paste nội dung kubeconfig, sửa server → https://10.8.0.1:6443
```

Set KUBECONFIG permanent:
```bash
echo 'export KUBECONFIG=~/.kube/company-k3s.yaml' >> ~/.bashrc
source ~/.bashrc
```

---

### 5.3 Test kubectl từ máy local (bật VPN trước)

```bash
kubectl get nodes
# NAME         STATUS   ROLES                  AGE   VERSION
# k3s-server   Ready    control-plane,master   5m    v1.x.x

kubectl get namespaces
```

---

## [LOCAL] Bước 6: Cài k9s trên máy local

### Windows

```powershell
winget install k9s
```

Hoặc Chocolatey:
```powershell
choco install k9s
```

Chạy k9s (PowerShell — bật VPN trước):
```powershell
$env:KUBECONFIG = "$HOME\.kube\company-k3s.yaml"
k9s
```

### macOS

```bash
brew install k9s
```

Chạy (bật VPN trước):
```bash
k9s
```

### Linux

```bash
# Tải binary mới nhất
curl -sS https://webinstall.dev/k9s | bash
# Hoặc:
wget https://github.com/derailed/k9s/releases/latest/download/k9s_Linux_amd64.tar.gz
tar -xzf k9s_Linux_amd64.tar.gz
sudo mv k9s /usr/local/bin/
```

Chạy (bật VPN trước):
```bash
k9s
```

---

### Phím tắt k9s hay dùng

| Phím | Tác dụng |
|---|---|
| `:pod` | Xem tất cả pods |
| `:deploy` | Xem deployments |
| `:ns` | Chọn namespace |
| `l` | Xem logs pod |
| `s` | Shell vào pod |
| `d` | Describe resource |
| `ctrl+d` | Xoá resource |
| `/` | Filter/tìm kiếm |
| `?` | Help |

---

## [SERVER] Bước 7: Kiểm tra Traefik

```bash
kubectl get pods -n kube-system | grep traefik
kubectl get svc -n kube-system | grep traefik
```

---

## Verify toàn bộ

| Kiểm tra | Nơi chạy | Kết quả mong đợi |
|---|---|---|
| `kubectl get nodes` | Máy local (VPN bật) | k3s-server Ready |
| `kubectl get namespaces` | Máy local | 8 namespace đủ |
| `k9s` | Máy local | Thấy cluster và pods |
| `kubectl get pods -A` | Máy local | Tất cả Running |
