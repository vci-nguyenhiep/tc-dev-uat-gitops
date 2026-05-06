# infra-gitops

GitOps repo quản lý deployment cho 5 apps: admin, cms, hrm, ims, wms.

## Cấu trúc

```
infra-gitops/
├── argocd/
│   ├── project.yaml              ← AppProject định nghĩa tc-project
│   ├── root-app.yaml             ← App of Apps: tự sync toàn bộ argocd/
│   ├── dev/
│   │   ├── app-admin.yaml
│   │   ├── app-cms.yaml
│   │   ├── app-hrm.yaml
│   │   ├── app-ims.yaml
│   │   └── app-wms.yaml
│   └── uat/
│       ├── app-admin.yaml
│       ├── app-cms.yaml
│       ├── app-hrm.yaml
│       ├── app-ims.yaml
│       └── app-wms.yaml
│
├── manifests/
│   ├── dev/
│   │   ├── namespace.yaml
│   │   ├── admin/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── ingress.yaml
│   │   ├── cms/  (same structure)
│   │   ├── hrm/  (same structure)
│   │   ├── ims/  (same structure)
│   │   └── wms/  (same structure)
│   └── uat/
│       ├── namespace.yaml
│       ├── admin/
│       │   ├── deployment.yaml
│       │   ├── service.yaml
│       │   └── ingress.yaml
│       ├── cms/  (same structure)
│       ├── hrm/  (same structure)
│       ├── ims/  (same structure)
│       └── wms/  (same structure)
│
└── platform/
    └── middlewares/
        ├── vpn-middleware-dev.yaml
        └── vpn-middleware-uat.yaml
```

## Setup ban đầu (chỉ làm 1 lần)

```bash
# 1. Apply AppProject
kubectl apply -f argocd/project.yaml

# 2. Apply root App of Apps — sau đó ArgoCD tự sync mọi thứ
kubectl apply -f argocd/root-app.yaml
```

## Domain

| App   | DEV                      | UAT                      |
|-------|--------------------------|--------------------------|
| admin | dev-admin.company.com    | uat-admin.company.com    |
| cms   | dev-cms.company.com      | uat-cms.company.com      |
| hrm   | dev-hrm.company.com      | uat-hrm.company.com      |
| ims   | dev-ims.company.com      | uat-ims.company.com      |
| wms   | dev-wms.company.com      | uat-wms.company.com      |

## Quy tắc CI/CD

- CI build image → push lên Docker Hub với tag `<git-sha>`
- CI update `image:` trong đúng `manifests/<env>/<app>/deployment.yaml`
- ArgoCD phát hiện thay đổi → sync đúng app đó
- App khác không bị ảnh hưởng
- Rollback = revert 1 file trong Git

## Mapping branch → environment

| Branch             | Namespace | selfHeal | Ghi chú                        |
|--------------------|-----------|----------|--------------------------------|
| `develop`          | dev       | false    | Cho phép kubectl apply tay     |
| `uat` / `release/*`| uat       | true     | Enforce Git state nghiêm ngặt  |

## Secrets

Mỗi namespace cần 2 secrets (tạo thủ công hoặc qua Sealed Secrets):

```bash
# Docker Hub pull secret
kubectl create secret docker-registry dockerhub-secret \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_TOKEN \
  -n dev

# App secrets (DB password, JWT key, v.v.)
kubectl create secret generic app-dev-secret \
  --from-env-file=.env.dev \
  -n dev
```
