# K8s Secret — Các cách inject vào Environment Variables

## Tổng quan

```
Vault (source of truth)
  ↓  VSO sync
K8s Secret (app-dev-secret, redis-password, ...)
  ↓  inject
Pod environment variables
```

Pod không biết Vault tồn tại — chỉ đọc K8s Secret thông qua các cách bên dưới.

---

## Cách 1 — `value` hardcode

Dùng cho **non-sensitive config** không thay đổi theo môi trường.

```yaml
env:
  - name: ASPNETCORE_ENVIRONMENT
    value: "Development"
  - name: S3Config__Region
    value: "ap-southeast-1"
```

---

## Cách 2 — `envFrom: secretRef`

Inject **toàn bộ keys** của secret thành env vars cùng lúc. Dùng khi có nhiều keys cần inject.

```yaml
envFrom:
  - secretRef:
      name: app-dev-secret
  - secretRef:
      name: redis-password
  - secretRef:
      name: elasticsearch-password
```

- Tên env var = tên key trong K8s Secret
- Có thể khai báo nhiều `secretRef` — secret nào liệt kê **sau** thắng nếu trùng key
- Thường dùng kết hợp với `env` bên dưới cho non-sensitive config

---

## Cách 3 — `secretKeyRef`

Lấy **1 key cụ thể** từ secret, đặt tên env var tùy ý.

```yaml
env:
  - name: DB_USER
    valueFrom:
      secretKeyRef:
        name: app-dev-secret
        key: DB_USER
  - name: ELASTIC_PASSWORD
    valueFrom:
      secretKeyRef:
        name: elasticsearch-password
        key: ELASTIC_PASSWORD
```

Dùng khi:
- Tên env var khác với tên key trong secret
- Chỉ cần lấy 1-2 key từ secret thay vì inject toàn bộ

---

## Cách 4 — `$(VAR_NAME)` substitution

Embed giá trị của env var (kể cả từ secret) vào **connection string** hoặc giá trị phức hợp.

```yaml
envFrom:
  - secretRef:
      name: app-dev-secret          # inject DB_USER, DB_PASSWORD vào env

env:
  - name: ConnectionStrings__ConnectionStrings
    value: "Server=rds.host;Database=tc-dev-hrm;User Id=$(DB_USER);Password=$(DB_PASSWORD);TrustServerCertificate=true;Encrypt=true;"
```

Hoặc kết hợp với `secretKeyRef`:

```yaml
env:
  - name: ELASTIC_PASSWORD          # bước 1: expose secret thành named env var
    valueFrom:
      secretKeyRef:
        name: elasticsearch-password
        key: ELASTIC_PASSWORD

  - name: ElasticsearchOptions__Uri  # bước 2: embed bằng $()
    value: "http://elastic:$(ELASTIC_PASSWORD)@elasticsearch.monitoring.svc.cluster.local:9200"
```

**Điều kiện hoạt động:** biến được define qua `envFrom` hoặc `env` trước đó — `envFrom` luôn được xử lý trước `env`.

---

## Cách 5 — `configMapKeyRef`

Tương tự `secretKeyRef` nhưng đọc từ **ConfigMap** thay vì Secret. Dùng cho config non-sensitive cần thay đổi mà không muốn rebuild image.

```yaml
env:
  - name: APP_ENV
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: ENVIRONMENT
```

---

## Pattern áp dụng trong project

```yaml
spec:
  containers:
    - name: tc-hrm-api
      envFrom:
        - secretRef:
            name: app-dev-secret          # DB_USER, DB_PASSWORD, JWT keys, AWS keys...
        - secretRef:
            name: redis-password          # REDIS_PASSWORD
        - secretRef:
            name: elasticsearch-password  # ELASTIC_PASSWORD
      env:
        # Non-sensitive config — hardcode
        - name: ASPNETCORE_ENVIRONMENT
          value: "Development"
        - name: S3Config__Region
          value: "ap-southeast-1"

        # Connection string — embed secret bằng $()
        - name: ConnectionStrings__ConnectionStrings
          value: "Server=rds.host;Database=tc-dev-hrm;User Id=$(DB_USER);Password=$(DB_PASSWORD);TrustServerCertificate=true;Encrypt=true;"
        - name: CacheOptions__RedisDistributedCacheOptions__ConnectionString
          value: "redis.data.svc.cluster.local:6379,password=$(REDIS_PASSWORD)"
```

---

## So sánh

| Cách | Khi nào dùng |
|------|--------------|
| `value` hardcode | Non-sensitive, không đổi theo môi trường |
| `envFrom: secretRef` | Nhiều keys, tên env var trùng với key trong secret |
| `secretKeyRef` | 1-2 key, cần đặt tên env var khác với key gốc |
| `$(VAR_NAME)` | Embed secret vào connection string hoặc giá trị phức hợp |
| `configMapKeyRef` | Config thông thường, không sensitive |
