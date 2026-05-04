# infra-gitops

GitOps repo quản lý deployment cho 5 apps: admin, wms, hrm, ims, cms.

## Cấu trúc

```
infra-gitops/
├── argocd-apps/                  ← Apply 1 lần khi setup, không cần đụng nữa
│   ├── dev-admin.yaml
│   ├── dev-wms.yaml
│   ├── dev-hrm.yaml
│   ├── dev-ims.yaml
│   ├── dev-cms.yaml
│   ├── uat-admin.yaml
│   ├── uat-wms.yaml
│   ├── uat-hrm.yaml
│   ├── uat-ims.yaml
│   └── uat-cms.yaml
│
├── environments/
│   ├── dev/
│   │   ├── admin/deployment.yaml
│   │   ├── wms/deployment.yaml
│   │   ├── hrm/deployment.yaml
│   │   ├── ims/deployment.yaml
│   │   └── cms/deployment.yaml
│   └── uat/
│       ├── admin/deployment.yaml
│       ├── wms/deployment.yaml
│       ├── hrm/deployment.yaml
│       ├── ims/deployment.yaml
│       └── cms/deployment.yaml
│
└── platform/
    └── middlewares/
        ├── vpn-middleware-dev.yaml
        └── vpn-middleware-uat.yaml
```

## Domain

| App | DEV | UAT |
|---|---|---|
| admin | dev-admin.company.com | uat-admin.company.com |
| wms | dev-wms.company.com | uat-wms.company.com |
| hrm | dev-hrm.company.com | uat-hrm.company.com |
| ims | dev-ims.company.com | uat-ims.company.com |
| cms | dev-cms.company.com | uat-cms.company.com |

## Quy tắc

- CI push code → update image tag trong đúng `environments/<env>/<app>/deployment.yaml`
- ArgoCD phát hiện thay đổi → sync đúng app đó
- App khác không bị ảnh hưởng
- Rollback = revert 1 file trong Git

## Mapping branch → environment

| Branch | Namespace | selfHeal |
|---|---|---|
| `develop` | dev | false (cho kubectl apply tay) |
| `uat` / `release/*` | uat | true (enforce Git state) |
