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

| Quyền | dev namespace | uat namespace | data namespace | vault namespace |
|-------|:---:|:---:|:---:|:---:|
| Xem pods, logs | ✅ | ✅ | ❌ | ❌ |
| Xem deployments, services | ✅ | ✅ | ❌ | ❌ |
| Xem secrets | ❌ | ❌ | ❌ | ❌ |
| Restart deployment (rollout) | ✅ | ❌ | ❌ | ❌ |
| Exec vào pod | ✅ | ❌ | ❌ | ❌ |
| Xóa/tạo resource | ❌ | ❌ | ❌ | ❌ |

---

## Bước 1: Tạo Role

```bash
# Role cho namespace dev (xem + restart + exec)
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: dev-role
  namespace: dev
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "services", "configmaps"]
  verbs: ["get", "list", "watch"]
- apiGroups: [""]
  resources: ["pods/exec"]
  verbs: ["create"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "statefulsets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments"]
  verbs: ["patch"]   # cho phép rollout restart
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses"]
  verbs: ["get", "list", "watch"]
EOF

# Role cho namespace uat (chỉ xem, không exec, không restart)
kubectl apply -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: uat-readonly-role
  namespace: uat
rules:
- apiGroups: [""]
  resources: ["pods", "pods/log", "services", "configmaps"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets", "statefulsets"]
  verbs: ["get", "list", "watch"]
- apiGroups: ["networking.k8s.io"]
  resources: ["ingresses"]
  verbs: ["get", "list", "watch"]
EOF
```

---

## Bước 2: Tạo ServiceAccount cho từng dev

```bash
# Thay DEV_NAME bằng tên thực (vd: nguyen-van-a)
DEV_NAME="nguyen-van-a"

kubectl create serviceaccount $DEV_NAME -n dev

# Gán role dev namespace
kubectl create rolebinding ${DEV_NAME}-dev-binding \
  --role=dev-role \
  --serviceaccount=dev:$DEV_NAME \
  -n dev

# Gán role uat namespace (chỉ xem)
kubectl create rolebinding ${DEV_NAME}-uat-binding \
  --role=uat-readonly-role \
  --serviceaccount=dev:$DEV_NAME \
  -n uat
```

---

## Bước 3: Tạo kubeconfig cho dev

```bash
DEV_NAME="nguyen-van-a"
VPN_SERVER_IP="10.8.0.1"    # IP VPN của server
OUTPUT_FILE="${DEV_NAME}-kubeconfig.yaml"

# Tạo token (1 năm)
TOKEN=$(kubectl create token $DEV_NAME -n dev --duration=8760h)

# Tạo file kubeconfig
cat > $OUTPUT_FILE <<EOF
apiVersion: v1
kind: Config
clusters:
- name: k3s-cluster
  cluster:
    server: https://${VPN_SERVER_IP}:6443
    insecure-skip-tls-verify: true
contexts:
- name: k3s-cluster
  context:
    cluster: k3s-cluster
    user: ${DEV_NAME}
    namespace: dev
current-context: k3s-cluster
users:
- name: ${DEV_NAME}
  user:
    token: ${TOKEN}
EOF

echo "Kubeconfig saved: $OUTPUT_FILE"
```

Gửi file `${DEV_NAME}-kubeconfig.yaml` cho dev.

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

## Tiện ích: Script port-forward tự động

Tạo file `redis-forward.sh` (Linux/macOS) hoặc `redis-forward.ps1` (Windows):

**Linux/macOS:**

```bash
#!/bin/bash
echo "Forwarding Redis (namespace dev) → localhost:6379 ..."
echo "Ctrl+C để dừng"
kubectl port-forward svc/redis-master 6379:6379 -n dev
```

**Windows (PowerShell):**

```powershell
Write-Host "Forwarding Redis (namespace dev) -> localhost:6379 ..."
Write-Host "Ctrl+C de dung"
kubectl port-forward svc/redis-master 6379:6379 -n dev
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
