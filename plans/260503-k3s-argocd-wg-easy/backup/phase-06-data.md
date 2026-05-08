# Phase 06 — Data Services (PostgreSQL + Redis)

## Bước 1: Sửa password trong config files

Trước khi apply, **BẮT BUỘC** đổi password trong các file sau:

```
configs/data/postgres-dev.yaml  → CHANGE_ME_DEV_PASSWORD
configs/data/postgres-uat.yaml  → CHANGE_ME_UAT_PASSWORD
configs/data/redis-dev.yaml     → CHANGE_ME_DEV_REDIS_PASSWORD
configs/data/redis-uat.yaml     → CHANGE_ME_UAT_REDIS_PASSWORD
```

**Lưu ý bảo mật**: Không commit password thật vào Git. Dùng Kubernetes Secrets hoặc Sealed Secrets cho production.

## Bước 2: Apply data services

```bash
kubectl apply -f configs/data/postgres-dev.yaml
kubectl apply -f configs/data/postgres-uat.yaml
kubectl apply -f configs/data/redis-dev.yaml
kubectl apply -f configs/data/redis-uat.yaml
```

## Bước 3: Kiểm tra

```bash
kubectl get pods -n data
# postgres-dev-xxx   Running
# postgres-uat-xxx   Running
# redis-dev-xxx      Running
# redis-uat-xxx      Running

kubectl get pvc -n data
# postgres-dev-pvc   Bound
# postgres-uat-pvc   Bound
```

## Bước 4: Test kết nối DB từ app

Kết nối string từ app trong namespace `dev`:

```
PostgreSQL DEV:
  Host: postgres-dev.data.svc.cluster.local
  Port: 5432
  DB:   devdb
  User: devuser
  Pass: (password đã đặt)

PostgreSQL UAT:
  Host: postgres-uat.data.svc.cluster.local
  Port: 5432
  DB:   uatdb
  User: uatuser
  Pass: (password đã đặt)

Redis DEV:
  Host: redis-dev.data.svc.cluster.local
  Port: 6379
  Pass: (password đã đặt)

Redis UAT:
  Host: redis-uat.data.svc.cluster.local
  Port: 6379
  Pass: (password đã đặt)
```

## Bước 5: Test bằng tay

```bash
# Test PostgreSQL DEV
kubectl exec -it deployment/postgres-dev -n data -- \
  psql -U devuser -d devdb -c "SELECT version();"

# Test Redis DEV
kubectl exec -it deployment/redis-dev -n data -- \
  redis-cli -a CHANGE_ME_DEV_REDIS_PASSWORD ping
# PONG
```

## Bước 1 (bổ sung): Apply secrets trước khi apply data services

Secret YAML template đã có sẵn trong `configs/secrets/`. Thay password thực, sau đó apply:

```bash
# Sửa password trong file trước
vim configs/secrets/postgres-dev-secret.yaml
vim configs/secrets/postgres-uat-secret.yaml

# Apply (KHÔNG commit file này lên Git sau khi đã điền password thật)
kubectl apply -f configs/secrets/postgres-dev-secret.yaml
kubectl apply -f configs/secrets/postgres-uat-secret.yaml
```

> Secret đã được khai báo sẵn trong `configs/data/postgres-dev.yaml` và `postgres-uat.yaml`
> (phần `secretRef`). Chỉ cần apply secret này 1 lần — ArgoCD không quản lý secrets.

### Nếu muốn commit secret vào Git an toàn: dùng Sealed Secrets

```bash
# Cài kubeseal
brew install kubeseal  # macOS
# Linux: curl download từ github.com/bitnami-labs/sealed-secrets/releases

# Encrypt secret thành SealedSecret (an toàn để commit)
kubectl create secret generic postgres-dev-secret \
  -n data \
  --from-literal=POSTGRES_PASSWORD=your-real-password \
  --dry-run=client -o yaml | \
  kubeseal --format yaml > configs/secrets/postgres-dev-sealed-secret.yaml

# Commit file sealed-secret.yaml → ArgoCD apply → controller decrypt → Secret thật
```
