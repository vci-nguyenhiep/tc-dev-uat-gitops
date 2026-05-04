# Phase 09 — Monitoring cơ bản

## Giai đoạn 1: Uptime Kuma (nhẹ, đơn giản)

```bash
kubectl apply -f configs/monitoring/uptime-kuma.yaml
```

Truy cập: `https://uptime.company.com` (qua VPN)

Trong Uptime Kuma, thêm các monitor:
- `https://app.company.com` — public app
- `https://argocd.company.com` — ArgoCD (từ VPN)
- DB ping check (nếu cần)

---

## Giai đoạn 2: Prometheus + Grafana (nâng cao — cài sau khi stable)

### Cài kube-prometheus-stack qua ArgoCD

Sửa `CHANGE_ME_GRAFANA_PASSWORD` trong file trước khi apply:

```bash
vim configs/helm/monitoring-app.yaml

kubectl apply -f configs/helm/monitoring-app.yaml
```

ArgoCD sẽ tự pull Helm chart và deploy vào namespace `monitoring`. Theo dõi tiến trình:

```bash
kubectl get pods -n monitoring -w
# Chờ tất cả Running — stack này deploy khá lâu (~3-5 phút)
```

### Tạo Ingress cho Grafana (VPN only)

```yaml
# grafana-ingress.yaml
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: vpn-only
  namespace: monitoring
spec:
  ipAllowList:
    sourceRange:
      - 10.8.0.0/24

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana
  namespace: monitoring
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    traefik.ingress.kubernetes.io/router.middlewares: monitoring-vpn-only@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - grafana.company.com
      secretName: grafana-tls
  rules:
    - host: grafana.company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: monitoring-grafana
                port:
                  number: 80
```

```bash
kubectl apply -f grafana-ingress.yaml
```

Truy cập: `https://grafana.company.com` (qua VPN)
- Username: `admin`
- Password: (password đã set trong helm install)

### RAM usage estimate cho monitoring stack

```
kube-prometheus-stack:
  Prometheus:  500MB–1GB
  Grafana:     200MB
  Alertmanager: 100MB
  node-exporter: 50MB/node
  kube-state-metrics: 100MB
Tổng: ~1GB RAM
```

Với 16 GB RAM, vẫn đủ sau khi cài đủ stack.

---

## kubectl top (nhanh, không cần cài thêm)

k3s đã có metrics-server:

```bash
# Xem resource usage nodes
kubectl top nodes

# Xem resource usage pods
kubectl top pods -A

# Xem pods ngốn RAM nhất
kubectl top pods -A --sort-by=memory
```
