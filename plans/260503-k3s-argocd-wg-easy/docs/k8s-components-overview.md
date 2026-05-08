# Tổng hợp thành phần Kubernetes trong Plan k3s + ArgoCD

> **Cập nhật lần cuối:** 2026-05-07
> **Repo GitOps:** `https://github.com/vci-nguyenhiep/tc-dev-uat-gitop.git`

---

## 1. Tổ chức & Cô lập — Namespace

**8 namespace được tạo:**

| Namespace | Chứa gì | Quản lý bởi |
|-----------|---------|------------|
| `dev` | App DEV | ArgoCD — `manifests/dev/namespace.yaml` |
| `uat` | App UAT | ArgoCD — `manifests/uat/namespace.yaml` |
| `monitoring` | Elasticsearch, Kibana | ArgoCD — `manifests/infra/cluster/namespace-monitoring.yaml` |
| `data` | Redis | ArgoCD — `manifests/infra/cluster/namespace-data.yaml` |
| `argocd` | ArgoCD server | Bootstrap thủ công |
| `cert-manager` | cert-manager | Bootstrap thủ công (Helm) |
| `public` | App public (không cần VPN) | Kế hoạch — chưa deploy |
| `tools` | Uptime Kuma | Kế hoạch — chưa deploy |

**Tác dụng:** Namespace là biên giới cơ bản nhất. NetworkPolicy và Middleware đều dùng namespace làm đơn vị để áp rule.

---

## 2. Bảo mật mạng — NetworkPolicy

**8 policy đang được quản lý bởi ArgoCD, chia làm 4 loại:**

```
[default-deny]  →  chặn tất cả ingress traffic vào namespace
[allow-intra]   →  cho phép pod trong cùng namespace nói chuyện nhau
[allow-traefik] →  cho phép Traefik đẩy traffic vào app
[allow-*-to-db] →  chỉ dev/uat pod mới connect được DB
```

| Policy | Namespace | File trong repo | ArgoCD App |
|--------|-----------|----------------|-----------|
| `default-deny-ingress` | dev | `manifests/infra/dev/netpol-default-deny.yaml` | `dev-infra` |
| `allow-same-namespace` | dev | `manifests/infra/dev/netpol-allow-intra.yaml` | `dev-infra` |
| `allow-traefik` | dev | `manifests/infra/dev/netpol-allow-traefik.yaml` | `dev-infra` |
| `default-deny-ingress` | uat | `manifests/infra/uat/netpol-default-deny.yaml` | `uat-infra` |
| `allow-same-namespace` | uat | `manifests/infra/uat/netpol-allow-intra.yaml` | `uat-infra` |
| `allow-traefik` | uat | `manifests/infra/uat/netpol-allow-traefik.yaml` | `uat-infra` |
| `allow-dev-namespace` | data | `manifests/infra/cluster/netpol-allow-dev-to-db.yaml` | `cluster-infra` |
| `allow-uat-namespace` | data | `manifests/infra/cluster/netpol-allow-uat-to-db.yaml` | `cluster-infra` |

**Tác dụng:** Dev app **không thể** connect vào Postgres UAT dù cùng cluster, vì NetworkPolicy chặn ở tầng kernel.

---

## 3. Access Control — Traefik Middleware

**Loại duy nhất: `ipAllowList`** — chặn request không từ VPN IP range

| Middleware | Namespace | File trong repo | ArgoCD App |
|-----------|-----------|----------------|-----------|
| `vpn-only` | `argocd` | `configs/argocd/vpn-middleware.yaml` | Bootstrap thủ công |
| `vpn-only` | `dev` | `manifests/infra/dev/middleware-vpn-only.yaml` | `dev-infra` |
| `vpn-only` | `uat` | `manifests/infra/uat/middleware-vpn-only.yaml` | `uat-infra` |
| `vpn-only` | `monitoring` | `manifests/elastic-stack/middleware/vpn-only.yaml` | `elastic-stack` |

> `10.8.0.0/24` = WireGuard VPN subnet. `10.42.0.0/16` = Pod CIDR (k3s internal, chỉ argocd namespace).

**Tác dụng:** Request từ internet bị block tại Traefik trước khi vào app. Chỉ ai kết nối VPN mới truy cập được.

---

## 4. SSL / TLS — Cert-Manager CRDs

| Kind | Name | File trong repo | ArgoCD App |
|------|------|----------------|-----------|
| `ClusterIssuer` | `letsencrypt-prod` | `manifests/infra/cluster/clusterissuer-prod.yaml` | `cluster-infra` |
| `ClusterIssuer` | `letsencrypt-staging` | `manifests/infra/cluster/clusterissuer-staging.yaml` | `cluster-infra` |

**Flow:** Ingress có annotation `cert-manager.io/cluster-issuer: letsencrypt-prod` → cert-manager tự động xin cert → lưu vào Secret → Traefik dùng.

> cert-manager phải được cài trước (Bootstrap) — ClusterIssuer chỉ hoạt động sau khi cert-manager CRDs tồn tại.

---

## 5. GitOps — ArgoCD CRDs

### AppProject

| Kind | Name | Tác dụng |
|------|------|---------|
| `AppProject` | `tc-project` | Giới hạn ArgoCD chỉ deploy vào `dev`, `uat`, `argocd` namespace |

### Application — cấu trúc App of Apps

```
tc-apps-root  (root-app.yaml — recurse: true trên argocd/)
├── dev-infra         → manifests/infra/dev/       (prune: false)
├── uat-infra         → manifests/infra/uat/        (prune: false)
├── cluster-infra     → manifests/infra/cluster/    (prune: false)
├── elastic-stack     → manifests/elastic-stack/    (prune: true)
├── redis             → manifests/redis/            (prune: true)
├── dev-tc-admin-api  → manifests/dev/tc-admin-api/
├── dev-tc-hrm-api    → manifests/dev/tc-hrm-api/
├── dev-tc-wms-api    → manifests/dev/tc-wms-api/
├── dev-tc-ims-be     → manifests/dev/tc-ims-be/
├── dev-tc-cms-be     → manifests/dev/tc-cms-be/
├── dev-tc-cms-be-category → manifests/dev/tc-cms-be-category/
├── dev-tc-notification-api → manifests/dev/tc-notification-api/
├── dev-gotenberg     → manifests/dev/gotenberg/
├── uat-tc-admin-api  → manifests/uat/tc-admin-api/
├── uat-tc-hrm-api    → manifests/uat/tc-hrm-api/
└── ... (8 app uat tương tự)
```

| Application | project | prune | Ghi chú |
|-------------|---------|-------|---------|
| `dev-infra` | tc-project | **false** | Middleware + NetworkPolicy — không auto-xóa |
| `uat-infra` | tc-project | **false** | Middleware + NetworkPolicy — không auto-xóa |
| `cluster-infra` | default | **false** | ClusterIssuer + RBAC + CronJob + Namespace |
| `elastic-stack` | default | true | Elasticsearch + Kibana + Middleware monitoring |
| `redis` | default | true | Redis StatefulSet |
| `dev-tc-*` / `dev-gotenberg` | tc-project | true | App microservices DEV |
| `uat-tc-*` / `uat-gotenberg` | tc-project | true | App microservices UAT |

**Flow:** Push manifest lên Git → ArgoCD phát hiện diff → tự `kubectl apply` → Pod mới lên.

---

## 6. Workload — Deployment & StatefulSet

| Kind | Dùng cho | Namespace | Lý do chọn |
|------|---------|-----------|-----------|
| `Deployment` | 8 app DEV, 8 app UAT, Kibana | dev, uat, monitoring | Stateless, rolling update |
| `StatefulSet` | Elasticsearch, Redis | monitoring, data | Cần stable hostname + stable PVC |

---

## 7. Lưu trữ — PersistentVolumeClaim

| PVC | Namespace | Size | StorageClass | Tạo bởi |
|-----|-----------|------|-------------|---------|
| `elasticsearch-data` (VolumeClaimTemplate) | monitoring | 30Gi | local-path | ArgoCD — `elastic-stack` App |
| `redis-data` (VolumeClaimTemplate) | data | — | local-path | ArgoCD — `redis` App |

> **`local-path`** = dữ liệu lưu trực tiếp trên ổ cứng node. Nếu node bị xóa → mất data.
> PVC không bị xóa khi `prune: true` vì ArgoCD có cơ chế bảo vệ PVC mặc định.

---

## 8. Routing — Ingress & IngressRoute

| Kind | Dùng cho | Ghi chú |
|------|---------|---------|
| `Ingress` (standard) | Tất cả app DEV/UAT, Kibana, ES | Middleware qua annotation `traefik.ingress.kubernetes.io/router.middlewares` |
| `IngressRoute` (Traefik CRD) | ArgoCD | Middleware trực tiếp trong spec, hỗ trợ gRPC/TLS passthrough |

---

## 9. Tự động hóa — CronJob + RBAC

**ECR token refresh** — chạy mỗi 6 giờ, quản lý bởi ArgoCD `cluster-infra`:

```
CronJob: ecr-token-refresh (kube-system)        manifests/infra/cluster/ecr-cronjob.yaml
  └─ ServiceAccount: ecr-token-refresh           manifests/infra/cluster/ecr-rbac.yaml
       └─ ClusterRole: get/create/patch Secret
            └─ ClusterRoleBinding → bind SA với Role
```

**Lưu ý:** Secret `aws-ecr-credentials` (chứa AWS credentials) phải `kubectl apply` thủ công vào `kube-system` — **KHÔNG commit lên Git**.

**Tác dụng:** ECR token hết hạn sau 12h, CronJob tự lấy token mới và update `ecr-secret` trong namespace `dev` và `uat`.

---

## 10. Quản lý Secret — Ngoài GitOps

Các Secret sau phải được `kubectl apply` thủ công, **không commit lên Git:**

| Secret | Namespace | Chứa gì |
|--------|-----------|---------|
| `aws-ecr-credentials` | kube-system | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ECR_REGISTRY, AWS_DEFAULT_REGION |
| `app-dev-secret` | dev | POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET |
| `app-uat-secret` | uat | POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET |
| `elasticsearch-secret` | monitoring | ELASTIC_PASSWORD |
| `kibana-secret` | monitoring | ELASTICSEARCH_PASSWORD |
| `redis-secret` | data | REDIS_PASSWORD |

---

## Tổng hợp — Luồng bảo vệ 3 lớp

```
Internet
   │
   ▼
[Traefik Ingress]
   │  Middleware ipAllowList  ← Lớp 1: chặn non-VPN IP
   ▼
[Namespace boundary]         ← Lớp 2: phân vùng
   │
   ▼
[NetworkPolicy]              ← Lớp 3: chặn lateral movement
   │
   ▼
[Pod / App]
```

---

## Phân loại theo cách quản lý

### Bootstrap thủ công (1 lần, không GitOps)
- k3s, wg-easy, ArgoCD, cert-manager
- Middleware `vpn-only` namespace `argocd`
- Tất cả Secret chứa credentials

### ArgoCD quản lý — prune: false (infra, không tự xóa)
- Middleware `vpn-only` — dev, uat, monitoring
- NetworkPolicy — dev, uat, data
- ClusterIssuer — letsencrypt-prod/staging
- ServiceAccount + ClusterRole + ClusterRoleBinding (ECR)
- CronJob ECR token refresh
- Namespace monitoring, data

### ArgoCD quản lý — prune: true (app workload, tự xóa khi xóa file)
- Deployment / StatefulSet / Service / Ingress / PDB
- ConfigMap (redis-config)

---

## Danh sách đầy đủ các Kind đang dùng

**Standard Kubernetes (14 kind):**

| Kind | API Group |
|------|-----------|
| Namespace | v1 |
| Secret | v1 |
| Service | v1 |
| ServiceAccount | v1 |
| ConfigMap | v1 |
| PersistentVolumeClaim | v1 |
| Deployment | apps/v1 |
| StatefulSet | apps/v1 |
| Ingress | networking.k8s.io/v1 |
| NetworkPolicy | networking.k8s.io/v1 |
| CronJob | batch/v1 |
| ClusterRole | rbac.authorization.k8s.io/v1 |
| ClusterRoleBinding | rbac.authorization.k8s.io/v1 |
| PodDisruptionBudget | policy/v1 |

**CRD — Non-Standard (6 kind):**

| Kind | API Group | Cài từ |
|------|-----------|--------|
| Middleware | traefik.io/v1alpha1 | Traefik (có sẵn trong k3s) |
| IngressRoute | traefik.io/v1alpha1 | Traefik (có sẵn trong k3s) |
| ClusterIssuer | cert-manager.io/v1 | cert-manager Helm chart |
| Certificate | cert-manager.io/v1 | cert-manager Helm chart |
| Application | argoproj.io/v1alpha1 | ArgoCD |
| AppProject | argoproj.io/v1alpha1 | ArgoCD |
