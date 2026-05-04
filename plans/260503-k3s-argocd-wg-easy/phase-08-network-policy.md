# Phase 08 — NetworkPolicy

## Mục đích

- Cho phép pods cùng namespace giao tiếp với nhau (admin ↔ wms ↔ hrm ↔ ims ↔ cms)
- Cho phép Traefik route traffic từ ngoài vào
- Cho phép app truy cập DB đúng môi trường (dev app → dev DB, uat app → uat DB)
- Chặn cross-environment (dev pod không được kết nối DB của uat và ngược lại)

---

## Bước 1: Apply default deny

Chặn toàn bộ ingress mặc định, sau đó mở từng thứ cần thiết.

```bash
kubectl apply -f configs/network-policies/default-deny-dev.yaml
kubectl apply -f configs/network-policies/default-deny-uat.yaml
```

---

## Bước 2: Allow pods cùng namespace giao tiếp

**Quan trọng:** `default-deny-ingress` sẽ chặn cả traffic nội bộ trong namespace.
Cần allow để admin có thể gọi wms, hrm gọi ims, v.v.

```bash
kubectl apply -f configs/network-policies/allow-intra-dev.yaml
kubectl apply -f configs/network-policies/allow-intra-uat.yaml
```

Sau bước này, từ bất kỳ pod nào trong namespace `dev` có thể gọi:

```
http://admin
http://wms
http://hrm
http://ims
http://cms
```

---

## Bước 3: Allow Traefik route traffic vào

Traefik chạy trong `kube-system` — cần được phép forward request vào pods.

```bash
kubectl apply -f configs/network-policies/allow-traefik-dev.yaml
kubectl apply -f configs/network-policies/allow-traefik-uat.yaml
```

---

## Bước 4: Allow app truy cập DB đúng môi trường

```bash
kubectl apply -f configs/network-policies/allow-dev-to-db.yaml
kubectl apply -f configs/network-policies/allow-uat-to-db.yaml
```

---

## Bước 5: Verify NetworkPolicy

```bash
kubectl get networkpolicy -n dev
# NAME                   POD-SELECTOR   AGE
# default-deny-ingress   <none>         ...
# allow-same-namespace   <none>         ...
# allow-traefik          <none>         ...

kubectl get networkpolicy -n uat
kubectl get networkpolicy -n data
```

---

## Bước 6: Test

### Test giao tiếp nội bộ (phải thành công)

```bash
# Chạy test pod trong namespace dev
kubectl run test-pod --image=curlimages/curl:latest -n dev --rm -it -- sh

# Trong test pod, gọi các service khác trong cùng namespace:
curl http://admin/health/live
curl http://wms/health/live
curl http://hrm/health/live
# Phải trả về 200 OK
```

### Test cross-namespace (phải bị chặn)

```bash
# Từ dev pod, thử gọi service trong uat (phải timeout)
curl --max-time 5 http://admin.uat.svc.cluster.local/health/live
# Connection timeout — đúng, bị chặn
```

### Test DB isolation (phải thành công dev→dev, bị chặn dev→uat)

```bash
kubectl run test-db --image=postgres:16-alpine -n dev --rm -it -- sh

# Dev DB (phải được):
psql -h postgres-dev.data.svc.cluster.local -U devuser -d devdb -c "SELECT 1;"

# UAT DB từ dev pod (phải bị từ chối):
psql -h postgres-uat.data.svc.cluster.local -U uatuser -d uatdb -c "SELECT 1;"
# Connection timeout
```

### Test Traefik vẫn hoạt động (phải thành công)

```bash
# Từ máy local (bật VPN), truy cập qua Ingress:
curl https://dev-admin.company.com/health/live
# Phải trả về 200 OK — Traefik vẫn route được vào pod
```

---

## Thứ tự apply đầy đủ

```bash
# 1. Default deny
kubectl apply -f configs/network-policies/default-deny-dev.yaml
kubectl apply -f configs/network-policies/default-deny-uat.yaml

# 2. Allow intra-namespace (pods giao tiếp nhau)
kubectl apply -f configs/network-policies/allow-intra-dev.yaml
kubectl apply -f configs/network-policies/allow-intra-uat.yaml

# 3. Allow Traefik
kubectl apply -f configs/network-policies/allow-traefik-dev.yaml
kubectl apply -f configs/network-policies/allow-traefik-uat.yaml

# 4. Allow DB access đúng môi trường
kubectl apply -f configs/network-policies/allow-dev-to-db.yaml
kubectl apply -f configs/network-policies/allow-uat-to-db.yaml
```

---

## Tổng hợp NetworkPolicy theo namespace

### Namespace `dev`

| Policy | Cho phép |
|---|---|
| `default-deny-ingress` | Chặn tất cả ingress mặc định |
| `allow-same-namespace` | Pods trong `dev` gọi nhau |
| `allow-traefik` | Traefik forward request từ ngoài vào |

### Namespace `uat`

| Policy | Cho phép |
|---|---|
| `default-deny-ingress` | Chặn tất cả ingress mặc định |
| `allow-same-namespace` | Pods trong `uat` gọi nhau |
| `allow-traefik` | Traefik forward request từ ngoài vào |

### Namespace `data`

| Policy | Cho phép |
|---|---|
| `allow-dev-namespace` | Pods `env=dev` nhận kết nối từ namespace `dev` |
| `allow-uat-namespace` | Pods `env=uat` nhận kết nối từ namespace `uat` |
