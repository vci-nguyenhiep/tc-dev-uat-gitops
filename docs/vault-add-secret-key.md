# Hướng dẫn thêm secret key mới vào Vault và dùng trong k8s

Dùng khi cần thêm env var mới cho app (ví dụ: `KIBANA_URL`, `REDIS_HOST`, `THIRD_PARTY_API_KEY`, v.v.)

---

## Cơ chế hoạt động

```
Vault UI (thêm key)
  ↓ tự động ≤60s
VSO sync → k8s Secret cập nhật
  ↓ thủ công
kubectl rollout restart → pod nhận env mới
```

Secret paths tương ứng với từng môi trường:

| Vault path | k8s Secret | Namespace |
|---|---|---|
| `secret/dev/app` | `app-dev-secret` | `dev` |
| `secret/uat/app` | `app-uat-secret` | `uat` |
| `secret/data/postgres-dev` | `postgres-dev-secret` | `data` |
| `secret/data/postgres-uat` | `postgres-uat-secret` | `data` |
| `secret/shared/aws-ecr` | `aws-ecr-credentials` | `kube-system` |

---

## Bước 1 — Thêm key trên Vault UI

1. Bật VPN → vào `https://vault.company.com` → login
2. **Secrets** → **secret/** → chọn path tương ứng (ví dụ: `dev/app`)
3. **Create new version**
4. Thêm cặp key-value mới, ví dụ:
   ```
   Key:   KIBANA_URL
   Value: http://kibana.monitoring.svc.cluster.local:5601
   ```
5. **Save**

> Các key cũ không bị ảnh hưởng — Vault lưu theo version, chỉ ghi đè nếu trùng key.

---

## Bước 2 — Kiểm tra VSO đã sync chưa

Sau tối đa 60 giây:

```bash
# Xem k8s Secret đã có key mới chưa
kubectl get secret app-dev-secret -n dev -o jsonpath='{.data.KIBANA_URL}' | base64 -d
# http://kibana.monitoring.svc.cluster.local:5601
```

Nếu chưa có, kiểm tra trạng thái VaultStaticSecret:

```bash
kubectl get vaultstaticsecret app-dev-secret -n dev
# READY   STATUS
# True    Synced
```

---

## Bước 3 — Dùng key trong Deployment

### Cách 1 — envFrom (lấy toàn bộ secret, không cần sửa khi thêm key mới)

Nếu Deployment đã có `envFrom` trỏ vào secret thì **không cần sửa gì** — key mới tự có sau khi restart pod.

```yaml
envFrom:
  - secretRef:
      name: app-dev-secret
```

### Cách 2 — env valueFrom (chỉ lấy key cụ thể, hoặc muốn đổi tên)

```yaml
env:
  - name: KIBANA_URL              # tên env var trong pod
    valueFrom:
      secretKeyRef:
        name: app-dev-secret
        key: KIBANA_URL           # tên key trong Vault
```

---

## Bước 4 — Restart pod để nhận env mới

k8s không tự restart pod khi Secret thay đổi, phải restart thủ công:

```bash
kubectl rollout restart deployment/<app-name> -n dev

# Kiểm tra pod đã nhận env chưa
kubectl exec -it deployment/<app-name> -n dev -- printenv KIBANA_URL
# http://kibana.monitoring.svc.cluster.local:5601
```

---

## Thêm key cho nhiều môi trường cùng lúc

Lặp lại Bước 1 cho từng path:

```bash
# Thêm qua CLI thay vì UI (nếu muốn nhanh hơn)
ROOT_TOKEN=$(cat vault-init.json | jq -r '.root_token')
kubectl exec vault-0 -n vault -- vault login $ROOT_TOKEN

# Thêm vào dev
kubectl exec vault-0 -n vault -- vault kv patch secret/dev/app \
  KIBANA_URL="http://kibana.monitoring.svc.cluster.local:5601"

# Thêm vào uat
kubectl exec vault-0 -n vault -- vault kv patch secret/uat/app \
  KIBANA_URL="http://kibana.monitoring.svc.cluster.local:5601"

# Restart apps ở cả 2 môi trường
kubectl rollout restart deployment/<app-name> -n dev
kubectl rollout restart deployment/<app-name> -n uat
```

> Dùng `vault kv patch` để chỉ thêm/sửa key được chỉ định, không ghi đè các key khác.
> Dùng `vault kv put` để ghi đè toàn bộ — cẩn thận mất key cũ.

---

## Xóa key khỏi Vault

```bash
# Xóa 1 key cụ thể (không xóa key khác trong cùng path)
kubectl exec vault-0 -n vault -- vault kv patch secret/dev/app \
  -delete=KIBANA_URL
```

VSO sync lại → key bị xóa khỏi k8s Secret → restart pod để áp dụng.
