# Phase 09 — Monitoring: Elasticsearch + Kibana

**Namespace**: `monitoring`  
**Domain**: `tc-elasticsearch.vcijsc.com`, `tc-kibana.vcijsc.com` (qua VPN)  
**Version**: Elasticsearch + Kibana `7.17.0`

---

## Cấu trúc manifest

```
manifests/elastic-stack/
├── elasticsearch/
│   ├── secret.yaml          # ELASTIC_PASSWORD
│   ├── headless-service.yaml
│   ├── service.yaml         # ClusterIP :9200
│   ├── statefulset.yaml     # 1 replica, 30Gi PVC
│   └── ingress.yaml         # tc-elasticsearch.vcijsc.com (VPN only)
└── kibana/
    ├── secret.yaml          # ELASTICSEARCH_PASSWORD cho kibana_system
    ├── deployment.yaml      # 1 replica
    ├── service.yaml         # ClusterIP :5601
    └── ingress.yaml         # tc-kibana.vcijsc.com (VPN only)
```

---

## Bước 1 — Tạo namespace

```bash
kubectl create namespace monitoring
```

---

## Bước 2 — Deploy Elasticsearch

```bash
# Secret trước — chứa ELASTIC_PASSWORD
kubectl apply -f manifests/elastic-stack/elasticsearch/secret.yaml

# Services
kubectl apply -f manifests/elastic-stack/elasticsearch/headless-service.yaml
kubectl apply -f manifests/elastic-stack/elasticsearch/service.yaml

# StatefulSet (deploy sau cùng)
kubectl apply -f manifests/elastic-stack/elasticsearch/statefulset.yaml
```

Chờ Elasticsearch sẵn sàng — lần đầu khởi động mất **3–5 phút** (startup probe có `initialDelaySeconds: 180`):

```bash
kubectl get pods -n monitoring -w
# Chờ elasticsearch-0 → Running/Ready
```

Kiểm tra health từ trong cluster:

```bash
kubectl exec -n monitoring elasticsearch-0 -- curl -s http://localhost:9200/_cluster/health | grep status
# → "status":"green" hoặc "yellow" là OK
```

---

## Bước 3 — Deploy Kibana

```bash
kubectl apply -f manifests/elastic-stack/kibana/secret.yaml
kubectl apply -f manifests/elastic-stack/kibana/service.yaml
kubectl apply -f manifests/elastic-stack/kibana/deployment.yaml
```

Chờ Kibana sẵn sàng:

```bash
kubectl get pods -n monitoring -l app=kibana -w
# Chờ Running/Ready (~1–2 phút sau khi Elasticsearch healthy)
```

---

## Bước 4 — Tạo Middleware VPN-only (nếu chưa có)

Nếu namespace `monitoring` chưa có middleware `vpn-only`, tạo mới:

```yaml
# vpn-only-middleware.yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: vpn-only
  namespace: monitoring
spec:
  ipAllowList:
    sourceRange:
      - 10.8.0.0/24
```

```bash
kubectl apply -f vpn-only-middleware.yaml
```

---

## Bước 5 — Apply Ingress

```bash
kubectl apply -f manifests/elastic-stack/elasticsearch/ingress.yaml
kubectl apply -f manifests/elastic-stack/kibana/ingress.yaml
```

Kiểm tra TLS cert:

```bash
kubectl get certificate -n monitoring
# tc-kibana-tls phải READY=True
```

---

## Bước 6 — Truy cập

| Service | URL | Ghi chú |
|---------|-----|---------|
| Kibana | `https://tc-kibana.vcijsc.com` | Qua VPN |
| Elasticsearch API | `https://tc-elasticsearch.vcijsc.com` | Qua VPN |

Kibana mặc định kết nối `http://elasticsearch:9200` bằng user `kibana_system`.

---

## Resource usage ước tính

```
Elasticsearch:  requests 1Gi / limits 2Gi RAM,  500m–1 CPU
Kibana:         requests 512Mi / limits 1Gi RAM, 200m–1 CPU
PVC:            30Gi (local-path)
Tổng RAM:       ~1.5–3Gi
```

Với server 16 GB RAM vẫn đủ sau khi cài full stack.

---

## Kiểm tra nhanh sau deploy

```bash
# Tất cả pods running
kubectl get pods -n monitoring

# PVC bound
kubectl get pvc -n monitoring

# Ingress có ADDRESS
kubectl get ingress -n monitoring

# Log Elasticsearch nếu có lỗi
kubectl logs -n monitoring elasticsearch-0 --tail=50

# Log Kibana
kubectl logs -n monitoring -l app=kibana --tail=50
```

---

## Lưu ý

- `xpack.security.enabled: "false"` — Elasticsearch không yêu cầu xác thực nội bộ; bảo vệ bằng Traefik Middleware VPN-only.
- `ES_JAVA_OPTS: "-Xms1g -Xmx1g"` — heap cố định 1 GB; không tăng quá 50% RAM node.
- `storageClassName: local-path` — data lưu trực tiếp trên node; nếu node xoá thì mất data — cần backup định kỳ.
- Kibana sử dụng user `kibana_system` (secret riêng), không dùng `elastic` user.
