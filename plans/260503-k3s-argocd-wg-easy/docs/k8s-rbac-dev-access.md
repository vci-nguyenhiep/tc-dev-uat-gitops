# K8s RBAC — Dev Access

## Phương án

Mỗi dev có **ServiceAccount riêng** + **kubeconfig riêng**.
Dev phải **bật VPN** trước khi connect.

```
Dev machine
  → bật WireGuard VPN
  → kubectl (dùng kubeconfig riêng)
  → k3s API server (10.8.0.1:6443)
  → RBAC kiểm tra quyền
```

---

## Phân quyền theo namespace

### Role Dev

| Quyền | dev namespace | uat namespace | data namespace | vault namespace |
|-------|:---:|:---:|:---:|:---:|
| Xem pods, logs | ✅ | ✅ | ❌ | ❌ |
| Xem deployments, services | ✅ | ✅ | ❌ | ❌ |
| Xem secrets | ❌ | ❌ | ❌ | ❌ |
| Restart deployment (rollout) | ✅ | ❌ | ❌ | ❌ |
| Exec vào pod | ✅ | ❌ | ❌ | ❌ |
| Xóa/tạo resource | ❌ | ❌ | ❌ | ❌ |

### Role Tech Lead

Quyền cao hơn dev — thao tác được trên cả `dev`, `stg` và `uat`:

| Quyền | dev namespace | stg namespace | uat namespace | data namespace | vault namespace |
|-------|:---:|:---:|:---:|:---:|:---:|
| Xem pods, logs, events | ✅ | ✅ | ✅ | ❌ | ❌ |
| Xem deployments, services, jobs | ✅ | ✅ | ✅ | ❌ | ❌ |
| Xem secrets | ❌ | ❌ | ❌ | ❌ | ❌ |
| Restart deployment (rollout) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Scale deployment/statefulset | ✅ | ✅ | ✅ | ❌ | ❌ |
| Exec vào pod | ✅ | ✅ | ✅ | ❌ | ❌ |
| Xóa pod (kẹt CrashLoop/Terminating) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Port-forward | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tạo/xóa deployment, service | ❌ | ❌ | ❌ | ❌ | ❌ |

> Tech lead **không** có quyền secrets (dùng Vault UI) và **không** tạo/xóa deployment/service — mọi thay đổi deploy đi qua ArgoCD (GitOps).

---

## Bước 1: Tạo Role

Apply **đủ cả 5 file** — `create-dev-account.sh` bind cả 4 role dev/stg/uat/data, thiếu role nào thì binding namespace đó trỏ vào role không tồn tại → dev bị Forbidden:

```bash
kubectl apply -f configs/role/dev-role.yaml
kubectl apply -f configs/role/stg-role.yaml
kubectl apply -f configs/role/uat-readonly-role.yaml
kubectl apply -f configs/role/data-portforward-role.yaml
kubectl apply -f configs/role/techlead-role.yaml
```

- [dev-role.yaml](../configs/role/dev-role.yaml) — namespace `dev`: xem + exec + restart deployment + port-forward
- [stg-role.yaml](../configs/role/stg-role.yaml) — namespace `stg`: như dev-role
- [uat-readonly-role.yaml](../configs/role/uat-readonly-role.yaml) — namespace `uat`: chỉ xem
- [data-portforward-role.yaml](../configs/role/data-portforward-role.yaml) — namespace `data`: xem pods/services + port-forward (không log, không exec)
- [techlead-role.yaml](../configs/role/techlead-role.yaml) — 3 Role cùng tên `techlead-role` ở `dev`/`stg`/`uat`: xem + exec + restart + scale + xóa pod

Verify đủ role:

```bash
kubectl get roles -A | grep -E 'dev-role|stg-role|uat-readonly|data-portforward|techlead'
```

---

## Bước 2: Tạo ServiceAccount cho từng dev

```bash
chmod +x configs/role/create-dev-account.sh
./configs/role/create-dev-account.sh nguyen-van-a
```

- [create-dev-account.sh](../configs/role/create-dev-account.sh) — tạo ServiceAccount + RoleBinding cho `dev` và `uat`

---

## Bước 2b: Tạo ServiceAccount cho tech lead

```bash
chmod +x configs/role/create-techlead-account.sh
./configs/role/create-techlead-account.sh tran-van-b
```

- [create-techlead-account.sh](../configs/role/create-techlead-account.sh) — tạo ServiceAccount (namespace `dev`) + RoleBinding `techlead-role` cho `dev`/`stg`/`uat` + `data-portforward-role` cho `data`

Tạo kubeconfig dùng chung script với dev (Bước 3): `./configs/role/create-kubeconfig.sh tran-van-b`

---

## Bước 3: Tạo kubeconfig cho dev

```bash
chmod +x configs/role/create-kubeconfig.sh

# Usage: ./create-kubeconfig.sh <dev-name> [vpn-server-ip]
./configs/role/create-kubeconfig.sh nguyen-van-a 10.8.0.1
```

Gửi file `nguyen-van-a-kubeconfig.yaml` cho dev.

- [create-kubeconfig.sh](../configs/role/create-kubeconfig.sh) — tạo token 1 năm + kubeconfig trỏ về VPN server

Lấy danh sách user (ServiceAccount) và role đã tạo:

```bash
# Danh sách user (ServiceAccount đặt ở namespace dev)
kubectl get serviceaccounts -n dev

# Danh sách role trong tất cả namespace
kubectl get roles -A

# Ai đang được bind role nào (user ↔ role)
kubectl get rolebindings -A -o wide
```

---

## Bước 4: Dev setup trên máy local

Dev copy file kubeconfig nhận được:

```bash
# Linux/macOS
cp nguyen-van-a-kubeconfig.yaml ~/.kube/config

# Windows (PowerShell)
Copy-Item nguyen-van-a-kubeconfig.yaml $env:USERPROFILE\.kube\config
```

Test (phải bật VPN trước):

```bash
kubectl get pods -n dev           # OK
kubectl get pods -n uat           # OK
kubectl get secrets -n dev        # Error: forbidden
kubectl get pods -n data          # Error: forbidden

# Restart app (dev namespace only)
kubectl rollout restart deployment/<app-name> -n dev

# Xem logs
kubectl logs -f deployment/<app-name> -n dev
```

---

## Revoke quyền

```bash
DEV_NAME="nguyen-van-a"

# Xóa rolebinding (thu hồi quyền ngay lập tức)
kubectl delete rolebinding ${DEV_NAME}-dev-binding -n dev
kubectl delete rolebinding ${DEV_NAME}-uat-binding -n uat

# Xóa serviceaccount (token cũ sẽ không dùng được nữa)
kubectl delete serviceaccount $DEV_NAME -n dev
```

Với tech lead (4 rolebinding):

```bash
TL_NAME="tran-van-b"

kubectl delete rolebinding ${TL_NAME}-dev-binding -n dev
kubectl delete rolebinding ${TL_NAME}-stg-binding -n stg
kubectl delete rolebinding ${TL_NAME}-uat-binding -n uat
kubectl delete rolebinding ${TL_NAME}-data-binding -n data

kubectl delete serviceaccount $TL_NAME -n dev
```

---

## Quản lý danh sách dev

```bash
# Xem tất cả ServiceAccount trong namespace dev
kubectl get serviceaccounts -n dev

# Xem ai có quyền gì trong namespace dev
kubectl get rolebindings -n dev -o wide

# Kiểm tra quyền của 1 dev cụ thể
kubectl auth can-i --list -n dev \
  --as=system:serviceaccount:dev:nguyen-van-a
```

---

## Lưu ý

- Dev phải **bật VPN** trước khi dùng kubectl — không có VPN thì không reach được API server
- Token có thời hạn **1 năm** — nhắc dev renew khi sắp hết hạn
- Secrets không bao giờ expose cho dev — dùng Vault UI (VPN-only) nếu cần xem/sửa secrets
- UAT chỉ xem, không exec/restart — tránh dev vô tình ảnh hưởng môi trường UAT

---

# Redis — Kết nối Redis trên k8s namespace `dev` từ máy Local

## Tổng quan

Dev dùng `kubectl port-forward` để tunnel Redis trên k8s namespace `dev` về `localhost:6379`.  
App chạy local kết nối như thể Redis đang ở máy local — không cần chạy Redis riêng.

**Điều kiện tiên quyết:** Bật VPN + có kubeconfig hợp lệ (xem phần K8s RBAC phía trên).

```
App local
  → localhost:6379
  → kubectl port-forward (tunnel qua VPN)
  → redis-service.dev.svc (k8s namespace dev)
```

---

## Bước 1: Kiểm tra Redis service trên k8s

```bash
# Xem service Redis trong namespace dev
kubectl get svc -n dev | grep redis

# Xem pod Redis đang chạy
kubectl get pods -n dev | grep redis
```

Ghi lại tên service, ví dụ: `redis-master` hoặc `redis`.

---

## Bước 2: Port-forward về localhost

```bash
# Forward redis service về localhost:6379
kubectl port-forward svc/redis 6380:6379 -n data

# Nếu muốn chạy nền (background)
kubectl port-forward svc/redis 6380:6379 -n data &
```

> Giữ terminal này mở trong suốt quá trình dev. Ctrl+C để dừng tunnel.

---

## Bước 3: Lấy password Redis từ Vault

Password Redis được lưu trong Vault, không hardcode trong code.

```bash
# Xem secret Redis (nếu được cấp quyền xem configmap)
kubectl get configmap -n dev | grep redis

# Hoặc hỏi DevOps để lấy password từ Vault
# Path thường là: secret/dev/redis
```

---

## Bước 4: Kiểm tra kết nối

```bash
# Ping (không password)
redis-cli -h localhost -p 6379 ping

# Ping (có password)
redis-cli -h localhost -p 6379 -a <password> ping
# → PONG

# Xem keys đang có
redis-cli -h localhost -p 6379 -a <password> KEYS "*"

# Monitor lệnh real-time
redis-cli -h localhost -p 6379 -a <password> MONITOR
```

---

## Bước 5: Cấu hình App local trỏ vào Redis k8s

### .NET (appsettings.Development.json)

```json
{
  "ConnectionStrings": {
    "Redis": "localhost:6379,password=<password>,abortConnect=false"
  }
}
```

### Node.js (.env.local)

```env
REDIS_URL=redis://:<password>@localhost:6379
```

### Python (.env)

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<password>
```

---

## Tiện ích: Script port-forward nhiều service cùng lúc

> `kubectl port-forward` là lệnh **blocking** — viết nhiều lệnh nối tiếp nhau thì chỉ lệnh đầu chạy.
> Phải đẩy từng tunnel vào background (`&` / job) rồi giữ script sống.

Tạo file `dev-forward.sh` (Linux/macOS) hoặc `dev-forward.ps1` (Windows):

**Linux/macOS:**

```bash
#!/bin/bash
# Forward các service namespace dev về localhost
# Ctrl+C MỘT lần để dừng TẤT CẢ tunnel
# Một tunnel chết (pod restart, mất VPN...) → tự tắt toàn bộ, không chạy "nửa sống nửa chết"

trap 'echo "Stopping all tunnels..."; kill 0' SIGINT SIGTERM EXIT

declare -A TUNNELS
kubectl port-forward svc/redis 6380:6379 -n data & TUNNELS[$!]="redis-master → localhost:6380"
kubectl port-forward svc/tc-admin-api 4998:4998 -n dev & TUNNELS[$!]="tc-admin-api → localhost:4998"
kubectl port-forward svc/tc-hrm-api   6000:6000 -n dev & TUNNELS[$!]="tc-hrm-api   → localhost:6000"
kubectl port-forward svc/tc-wms-api   6001:6001 -n dev & TUNNELS[$!]="tc-wms-api   → localhost:6001"

echo "Tunnels:"
for pid in "${!TUNNELS[@]}"; do echo "  ${TUNNELS[$pid]}"; done
echo "Ctrl+C để dừng tất cả"

# Giám sát: tunnel nào chết → báo tên → thoát (trap EXIT sẽ kill các tunnel còn lại)
while true; do
  for pid in "${!TUNNELS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "Tunnel DIED: ${TUNNELS[$pid]} — stopping all tunnels"
      exit 1
    fi
  done
  sleep 2
done
```

**Windows (PowerShell):**

```powershell
# Forward cac service namespace dev ve localhost
# Dong cua so / Ctrl+C roi chay lenh cleanup de dung tat ca

$forwards = @(
    "port-forward svc/redis 6380:6379 -n data",
    "port-forward svc/tc-admin-api 4998:4998 -n dev",
    "port-forward svc/tc-hrm-api 6000:6000 -n dev",
    "port-forward svc/tc-wms-api 6001:6001 -n dev"
)

$jobs = foreach ($f in $forwards) {
    Start-Job -ScriptBlock { param($cmdArgs) kubectl $cmdArgs.Split(" ") } -ArgumentList $f
}

Write-Host "Tunnels:"
Write-Host "  Redis        -> localhost:6380"
Write-Host "  tc-admin-api -> localhost:4998"
Write-Host "  tc-hrm-api   -> localhost:6000"
Write-Host "  tc-wms-api   -> localhost:6001"
Write-Host "Ctrl+C de thoat. Mot tunnel chet -> tu dong tat tat ca"

try {
    # -Any: thoat ngay khi job DAU TIEN ket thuc (tunnel chet) thay vi cho het ca 4
    $dead = Wait-Job -Job $jobs -Any
    Write-Host "Tunnel DIED (job $($dead.Id)) - stopping all tunnels"
    Receive-Job $dead   # in error cua tunnel chet de biet ly do
} finally {
    $jobs | Stop-Job
    $jobs | Remove-Job
}
```

**Xử lý sự cố:**

```bash
# Port local đang bận (address already in use) — tìm tunnel cũ còn sống và diệt
pkill -f "kubectl port-forward"          # Linux/macOS
Get-Job | Stop-Job; Get-Job | Remove-Job # Windows (job của session hiện tại)

# Tunnel đứt khi pod restart — không tự reconnect, chạy lại script
```

---

## Redis Insight (GUI — tùy chọn)

Xem data Redis trực quan qua giao diện web.

```bash
docker run -d --name redis-insight -p 5540:5540 redis/redisinsight:latest
```

Mở `http://localhost:5540` → Kết nối: Host `localhost`, Port `6379`, Password từ Vault.

---

## Lưu ý

- **Phải bật VPN** trước khi chạy `kubectl port-forward` — không có VPN không reach được cluster
- Port-forward chỉ hoạt động khi terminal đang mở — dừng terminal thì tunnel đứt
- Không dùng `FLUSHALL` — sẽ xóa data của cả team trên môi trường dev
- Không commit password Redis vào code — lấy từ Vault hoặc hỏi DevOps
