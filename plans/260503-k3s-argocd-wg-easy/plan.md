# Plan: k3s + ArgoCD + wg-easy Infrastructure

**Server**: 1 node Linux, 8 CPU, 16 GB RAM
**Domain**: company.com (thay bằng domain thực)
**Stack**: k3s + Traefik + wg-easy + cert-manager + ArgoCD + PostgreSQL + Redis

---

## Phases

| # | Phase | Thời gian ước tính | Status |
|---|---|---|---|
| 01 | Server preparation + UFW | 15 min | [ ] |
| 02 | wg-easy VPN + WireGuard client (Win/Mac/Linux) | 20 min | [ ] |
| 03 | k3s + kubectl + k9s local (Win/Mac/Linux) | 25 min | [ ] |
| 04 | cert-manager + SSL | 20 min | [ ] |
| 05 | ArgoCD + GitHub GitOps | 30 min | [ ] |
| 06 | HashiCorp Vault + Vault Secrets Operator (VSO) | 45 min | [ ] |
| 07 | App deployment via GitOps + AWS ECR | 20 min | [ ] |
| 08 | NetworkPolicy | 10 min | [ ] |
| 09 | Monitoring cơ bản | 15 min | [ ] |
| 10 | Expose Service qua LoadBalancer (không qua Ingress) | 10 min | [ ] |

**Tổng**: ~3 giờ cho lần đầu

---

## Thứ tự phụ thuộc

```
01 Server → 02 VPN → 03 k3s → 04 cert-manager → 05 ArgoCD
                                                       ↓
                                              06 Vault + VSO
                                                       ↓
                                          07 Apps + 08 NetworkPolicy
                                                       ↓
                                              09 Monitoring
                                                   ↓
                                          10 LoadBalancer (optional)
```

---

## Files cấu hình

```
configs/
├── wg-easy/
│   └── docker-compose.yml
├── cert-manager/
│   ├── cluster-issuer-staging.yaml
│   └── cluster-issuer-prod.yaml
├── argocd/
│   ├── vpn-middleware.yaml
│   └── argocd-ingress.yaml
├── network-policies/
│   ├── default-deny-dev.yaml
│   ├── default-deny-uat.yaml
│   ├── default-deny-data.yaml
│   ├── allow-dev-to-db.yaml
│   └── allow-uat-to-db.yaml
├── data/
│   ├── postgres-dev.yaml
│   ├── postgres-uat.yaml
│   ├── redis-dev.yaml
│   └── redis-uat.yaml
├── vault/
│   ├── vault-values.yaml
│   ├── vso-values.yaml
│   ├── vault-vpn-middleware.yaml
│   ├── vault-ingress.yaml
│   ├── argocd-vault-app.yaml
│   ├── argocd-vso-app.yaml
│   ├── vault-auth-data.yaml
│   ├── vault-auth-dev.yaml
│   ├── vault-auth-uat.yaml
│   ├── vault-auth-kube-system.yaml
│   ├── vault-static-secrets-data.yaml
│   ├── vault-static-secrets-dev.yaml
│   ├── vault-static-secrets-uat.yaml
│   └── vault-static-secret-ecr.yaml
├── apps/
│   ├── vpn-middleware-dev.yaml
│   ├── vpn-middleware-uat.yaml
│   ├── public-ingress-template.yaml
│   ├── dev-ingress-template.yaml
│   ├── uat-ingress-template.yaml
│   ├── argocd-app-public.yaml
│   ├── argocd-app-dev.yaml
│   └── argocd-app-uat.yaml
└── monitoring/
    └── uptime-kuma.yaml

gitops-repo-example/   ← cấu trúc GitOps repo mẫu trên GitHub
```

---

## Thay thế placeholder trước khi dùng

| Placeholder | Thay bằng |
|---|---|
| `company.com` | domain thực của bạn |
| `admin@company.com` | email thực |
| `YOUR_DOCKERHUB_USERNAME` | Docker Hub username |
| `YOUR_DOCKERHUB_TOKEN` | Docker Hub access token |
| `10.8.0.1` | IP VPN của server (mặc định wg-easy gán cho server) |
| `YOUR_GITHUB_REPO` | URL GitOps repo trên GitHub |
| `GITHUB_TOKEN` | GitHub Personal Access Token |
| `CHANGE_ME_DEV_PG_PASS` | Postgres password cho môi trường dev |
| `CHANGE_ME_UAT_PG_PASS` | Postgres password cho môi trường uat |
| `CHANGE_ME_DEV_REDIS_PASS` | Redis password cho môi trường dev |
| `CHANGE_ME_UAT_REDIS_PASS` | Redis password cho môi trường uat |
| `CHANGE_ME_DEV_JWT` | JWT secret cho apps dev |
| `CHANGE_ME_UAT_JWT` | JWT secret cho apps uat |
