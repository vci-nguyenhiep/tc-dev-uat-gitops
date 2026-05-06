# Hướng dẫn dùng nhiều kubeconfig cùng lúc

Dùng khi cần quản lý nhiều cluster (k3s, AWS EKS, GKE, v.v.) trên cùng một máy.

---

## Cách hoạt động

Kubectl đọc kubeconfig theo thứ tự ưu tiên:

1. Flag `--kubeconfig` (cao nhất)
2. Biến môi trường `KUBECONFIG`
3. File mặc định `~/.kube/config`

Khi `KUBECONFIG` trỏ nhiều file (ngăn cách bởi `;` trên Windows, `:` trên Linux/macOS), kubectl **merge** tất cả context lại thành một danh sách.

---

## Thiết lập trên Windows

### Bước 1 — Đặt tên file kubeconfig rõ ràng

```
~/.kube/
├── company-k3s.yaml     ← k3s cluster
├── config               ← AWS EKS (mặc định của aws eks update-kubeconfig)
```

### Bước 2 — Set KUBECONFIG trỏ nhiều file

```powershell
# Set vĩnh viễn cho user (không cần mở terminal mới mỗi lần)
[System.Environment]::SetEnvironmentVariable(
  "KUBECONFIG",
  "$HOME\.kube\company-k3s.yaml;$HOME\.kube\config",
  "User"
)
```

Thêm cluster mới thì nối thêm vào sau:

```powershell
[System.Environment]::SetEnvironmentVariable(
  "KUBECONFIG",
  "$HOME\.kube\company-k3s.yaml;$HOME\.kube\config;$HOME\.kube\gke-prod.yaml",
  "User"
)
```

> Mở terminal mới sau khi set để env var có hiệu lực.

### Bước 3 — Kiểm tra context

```powershell
kubectl config get-contexts
```

Output mẫu:

```
CURRENT   NAME                    CLUSTER         AUTHINFO        NAMESPACE
*         default                 default         default
          arn:aws:eks:...         arn:aws:eks:... arn:aws:eks:...
```

---

## Thiết lập trên Linux / macOS

```bash
# Thêm vào ~/.bashrc hoặc ~/.zshrc
export KUBECONFIG="$HOME/.kube/company-k3s.yaml:$HOME/.kube/config"

source ~/.bashrc
```

---

## Switch context

```powershell
# Xem context hiện tại
kubectl config current-context

# Switch sang k3s
kubectl config use-context default

# Switch sang AWS EKS
kubectl config use-context arn:aws:eks:ap-southeast-1:ACCOUNT_ID:cluster/CLUSTER_NAME
```

### Dùng flag --context để không cần switch

```powershell
# Chạy lệnh trên k3s
kubectl get nodes --context=default

# Chạy lệnh trên AWS EKS
kubectl get nodes --context=arn:aws:eks:ap-southeast-1:ACCOUNT_ID:cluster/CLUSTER_NAME
```

---

## Đổi tên context cho dễ nhớ

Context AWS EKS mặc định có tên rất dài (`arn:aws:eks:...`). Đổi tên lại:

```powershell
kubectl config rename-context \
  "arn:aws:eks:ap-southeast-1:123456789:cluster/my-cluster" \
  "aws-prod"

# Sau đó dùng tên ngắn
kubectl config use-context aws-prod
kubectl get nodes --context=aws-prod
```

---

## Merge nhiều file thành một (tùy chọn)

Nếu muốn gộp tất cả vào `~/.kube/config`:

```powershell
# Windows PowerShell
$env:KUBECONFIG = "$HOME\.kube\company-k3s.yaml;$HOME\.kube\config"
kubectl config view --flatten | Out-File "$HOME\.kube\config-merged.yaml" -Encoding utf8

# Dùng file merged
[System.Environment]::SetEnvironmentVariable("KUBECONFIG", "$HOME\.kube\config-merged.yaml", "User")
```

> Lưu ý: Sau khi merge, sửa thủ công thì chỉ sửa 1 file nhưng mất đi sự tách biệt theo cluster.

---

## Troubleshoot

| Lỗi | Nguyên nhân | Fix |
|---|---|---|
| `no configuration has been provided` | KUBECONFIG trỏ file không tồn tại | Kiểm tra path đúng chưa |
| `error: context not found` | Tên context sai | Chạy `kubectl config get-contexts` để xem tên đúng |
| AWS EKS mất sau khi set KUBECONFIG | KUBECONFIG không include `~/.kube/config` | Thêm `$HOME\.kube\config` vào danh sách |
| x509 certificate error | Cert cluster không có IP/domain đang kết nối | Xem `docs/k3s-tls-san.md` |
