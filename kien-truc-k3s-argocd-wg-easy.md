# Tài liệu kiến trúc triển khai DEV/UAT/Public Apps trên k3s

## 1. Mục tiêu

Triển khai một server Linux dùng **k3s** để chạy nhiều môi trường và ứng dụng:

- Một số app **public ra Internet** cho user sử dụng.
- Môi trường **DEV/UAT** chỉ truy cập được qua VPN.
- Công cụ quản trị như **Argo CD**, **Grafana** chỉ truy cập qua VPN.
- Sử dụng **wg-easy** làm VPN.
- Sử dụng **Traefik** làm Ingress Controller.
- Sử dụng **Argo CD** để triển khai CI/CD theo mô hình GitOps.
- Sử dụng **k9s** (chạy trên máy local qua VPN) để quản trị cluster thay Rancher.

---

## 2. Stack công nghệ

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| Linux Server | Máy chủ chạy toàn bộ hệ thống | Ubuntu Server 22.04+ |
| k3s | Kubernetes nhẹ | Chạy toàn bộ workload |
| Traefik | Ingress Controller | Mặc định có trong k3s |
| wg-easy | VPN WireGuard có UI | Chạy ngoài k3s bằng Docker Compose |
| Argo CD | GitOps/CD | VPN only |
| cert-manager | Quản lý SSL certificate | Dùng Let's Encrypt |
| k9s | TUI quản trị cluster | Cài trên máy local, connect qua VPN |
| Prometheus | Thu thập metrics | Tuỳ giai đoạn |
| Grafana | Dashboard monitoring | VPN only |
| Loki | Log aggregation | Tuỳ giai đoạn |
| Uptime Kuma | Monitor uptime | VPN only hoặc public tuỳ nhu cầu |
| PostgreSQL/MySQL/SQL Server | Database | Không public |
| Redis | Cache/queue | Không public |
| MinIO | Object storage nội bộ | Không public nếu dùng private |

---

## 3. Kiến trúc tổng thể

```txt
Internet
   |
   | Public:
   | - 80/tcp
   | - 443/tcp
   |
   | VPN:
   | - 51820/udp
   |
Firewall / Security Group
   |
Linux Server
   |
-----------------------------------------------------
| Host Layer                                         |
|                                                     |
|  wg-easy (Docker Compose)                           |
|  - WireGuard VPN                                    |
|  - VPN subnet: 10.8.0.0/24                          |
|  - Quản lý user VPN                                 |
|                                                     |
|  k3s                                                |
|  - Traefik Ingress                                  |
|  - Argo CD                                          |
|  - Public apps                                      |
|  - DEV apps                                         |
|  - UAT apps                                         |
|  - Monitoring tools                                 |
|  - Data services                                    |
-----------------------------------------------------

Máy local (Admin/DevOps):
  - k9s connect qua VPN → quản trị cluster
  - kubectl qua VPN → thao tác trực tiếp
```

---

## 4. Nguyên tắc truy cập

### 4.1. Public apps

Các app public cho user bên ngoài Internet sử dụng.

Ví dụ:

```txt
app.company.com
api.company.com
portal.company.com
```

Luồng truy cập:

```txt
User Internet
  -> https://app.company.com
  -> Traefik Ingress
  -> public namespace
  -> public-web service
  -> public-web pod
```

---

### 4.2. DEV/UAT apps

Các app DEV/UAT chỉ cho nhân sự nội bộ truy cập qua VPN.

Ví dụ:

```txt
dev-app.company.com
dev-api.company.com
uat-app.company.com
uat-api.company.com
```

Luồng truy cập:

```txt
Nhân sự bật VPN wg-easy
  -> nhận IP 10.8.0.x
  -> https://uat-app.company.com
  -> Traefik kiểm tra IP allowlist
  -> uat namespace
  -> uat-web service
  -> uat-web pod
```

---

### 4.3. Admin tools

Các công cụ quản trị chỉ cho admin/devops truy cập qua VPN.

Ví dụ:

```txt
argocd.company.com
grafana.company.com
uptime.company.com
```

Luồng truy cập:

```txt
Admin bật VPN wg-easy
  -> nhận IP 10.8.0.x
  -> https://argocd.company.com
  -> Traefik Middleware VPN Only
  -> Argo CD
```

---

## 5. Port public và private

### 5.1. Port được public ra Internet

| Port | Protocol | Source | Mục đích |
|---:|---|---|---|
| 80 | TCP | 0.0.0.0/0 | HTTP, redirect HTTPS, ACME challenge |
| 443 | TCP | 0.0.0.0/0 | HTTPS public apps |
| 51820 | UDP | 0.0.0.0/0 | WireGuard VPN |

---

### 5.2. Port chỉ cho VPN

| Port | Protocol | Source | Mục đích |
|---:|---|---|---|
| 22 | TCP | 10.8.0.0/24 | SSH |
| 6443 | TCP | 10.8.0.0/24 | Kubernetes API (kubectl, k9s) |

---

### 5.3. Port không public

```txt
1433  - SQL Server
3306  - MySQL
5432  - PostgreSQL
6379  - Redis
3000  - Grafana backend
9090  - Prometheus
8080  - App internal ports
NodePort range
Argo CD backend service
```

Nguyên tắc:

```txt
Chỉ public 80, 443, 51820/udp.
Các service khác phải đi qua Traefik hoặc VPN.
Database/Redis tuyệt đối không public.
```

---

## 6. Cấu hình UFW mẫu

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Public web traffic
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# WireGuard VPN
sudo ufw allow 51820/udp

# SSH only from VPN
sudo ufw allow from 10.8.0.0/24 to any port 22 proto tcp

# Kubernetes API only from VPN (kubectl, k9s)
sudo ufw allow from 10.8.0.0/24 to any port 6443 proto tcp

sudo ufw enable
sudo ufw status verbose
```

Nếu có IP tĩnh công ty:

```bash
sudo ufw allow from <IP_CONG_TY> to any port 22 proto tcp
sudo ufw allow from <IP_CONG_TY> to any port 6443 proto tcp
```

---

## 7. Domain đề xuất

### 7.1. Public domain

| Domain | Mục đích | Public |
|---|---|---:|
| app.company.com | Web app chính | Có |
| api.company.com | API public | Có |
| portal.company.com | Portal user | Có |
| vpn.company.com | WireGuard endpoint | Có, chỉ dùng cho VPN |

---

### 7.2. Private domain qua VPN

| Domain | Mục đích | VPN required |
|---|---|---:|
| dev-app.company.com | Web DEV | Có |
| dev-api.company.com | API DEV | Có |
| uat-app.company.com | Web UAT | Có |
| uat-api.company.com | API UAT | Có |
| argocd.company.com | Argo CD UI | Có |
| grafana.company.com | Grafana | Có |
| uptime.company.com | Uptime Kuma | Có |

---

## 8. Namespace thiết kế trong k3s

```txt
kube-system       # Thành phần mặc định của k3s
cert-manager      # Quản lý SSL certificate
argocd            # Argo CD
public            # App public cho user
dev               # Môi trường DEV
uat               # Môi trường UAT
tools             # Uptime Kuma, utility tools
monitoring        # Prometheus, Grafana, Loki
data              # DB, Redis, MinIO, backup jobs
```

Lệnh tạo namespace:

```bash
kubectl create namespace cert-manager
kubectl create namespace argocd
kubectl create namespace public
kubectl create namespace dev
kubectl create namespace uat
kubectl create namespace tools
kubectl create namespace monitoring
kubectl create namespace data
```

---

## 9. Cài đặt k3s

Cài k3s single-node:

```bash
curl -sfL https://get.k3s.io | sh -
```

Kiểm tra node:

```bash
sudo kubectl get nodes
sudo kubectl get pods -A
```

Tạo alias:

```bash
echo 'alias k=kubectl' >> ~/.bashrc
source ~/.bashrc
```

Lấy kubeconfig:

```bash
sudo cat /etc/rancher/k3s/k3s.yaml
```

---

## 10. Kết nối cluster từ máy local qua VPN

Sau khi bật VPN, copy kubeconfig từ server về máy local và sửa endpoint:

```bash
# Trên server
sudo cat /etc/rancher/k3s/k3s.yaml
```

Sửa `server` trong file kubeconfig:

```yaml
# Trước
server: https://127.0.0.1:6443

# Sau (IP VPN của server)
server: https://10.8.0.1:6443
```

Lưu vào máy local:

```bash
mkdir -p ~/.kube
# Paste nội dung kubeconfig vào file
vim ~/.kube/company-k3s.yaml

export KUBECONFIG=~/.kube/company-k3s.yaml
kubectl get nodes
```

---

## 11. k9s — Quản trị cluster từ máy local

k9s là TUI (terminal UI) cho Kubernetes, chạy trên máy local, connect vào cluster qua VPN.

### 11.1. Cài k9s

macOS:

```bash
brew install k9s
```

Linux:

```bash
curl -sS https://webinstall.dev/k9s | bash
```

Windows:

```bash
winget install k9s
```

### 11.2. Sử dụng

```bash
# Bật VPN trước, sau đó
export KUBECONFIG=~/.kube/company-k3s.yaml
k9s
```

### 11.3. Các thao tác thường dùng trong k9s

| Thao tác | Phím tắt |
|---|---|
| Xem pods | `:pod` |
| Xem deployments | `:deploy` |
| Xem logs | `l` |
| Exec vào pod | `s` (shell) |
| Describe resource | `d` |
| Xem events | `:events` |
| Xoá resource | `ctrl+d` |
| Filter namespace | `:ns` |

k9s thay thế hoàn toàn Rancher UI cho DevOps biết dùng terminal.

---

## 12. wg-easy

### 12.1. Vị trí triển khai

Chạy `wg-easy` ngoài k3s bằng Docker Compose.

Lý do:

```txt
VPN là lớp truy cập hạ tầng.
Nếu k3s lỗi, vẫn cần VPN/SSH để vào server sửa cluster.
Nếu wg-easy nằm trong k3s mà cluster lỗi -> mất đường vào.
```

Mô hình:

```txt
Linux Host
├── Docker Compose
│   └── wg-easy
└── k3s
```

---

### 12.2. Docker Compose cho wg-easy

```yaml
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:14   # pin version, không dùng latest
    container_name: wg-easy
    restart: unless-stopped
    environment:
      - WG_HOST=vpn.company.com
      - WG_PORT=51820
      - WG_DEFAULT_ADDRESS=10.8.0.x
      - WG_DEFAULT_DNS=1.1.1.1
      - PASSWORD_HASH=$$2y$$...          # bcrypt hash, không dùng plain text
    volumes:
      - ./etc_wireguard:/etc/wireguard
    ports:
      - "51820:51820/udp"
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.ip_forward=1
      - net.ipv4.conf.all.src_valid_mark=1
```

Sinh bcrypt password hash:

```bash
# Cài htpasswd
sudo apt install apache2-utils

# Sinh hash (thay yourpassword)
htpasswd -bnBC 10 "" yourpassword | tr -d ':\n'
```

Không expose Web UI của wg-easy ra Internet. Quản trị qua SSH tunnel hoặc VPN.

---

## 13. cert-manager

Cài cert-manager:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --set crds.enabled=true
```

ClusterIssuer Let's Encrypt (dùng HTTP01 challenge):

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-http
spec:
  acme:
    email: admin@company.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-http-account-key
    solvers:
      - http01:
          ingress:
            class: traefik
```

Apply:

```bash
kubectl apply -f cluster-issuer.yaml
```

Lưu ý:

```txt
HTTP01 challenge yêu cầu port 80 public và DNS phải resolve về IP server.
cert-manager tự tạo challenge endpoint riêng, không bị ảnh hưởng bởi VPN middleware.
Nên test với staging server trước để tránh rate limit:
  server: https://acme-staging-v02.api.letsencrypt.org/directory
```

---

## 14. Argo CD

### 14.1. Vai trò Argo CD

```txt
GitOps repo là source of truth.
Argo CD đọc manifest/Helm/Kustomize từ Git.
Argo CD sync trạng thái trong Git vào cluster.
Không chỉnh sửa workload trực tiếp nếu không commit vào Git trước.
```

---

### 14.2. Cài Argo CD

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

kubectl create namespace argocd

helm install argocd argo/argo-cd \
  --namespace argocd
```

---

### 14.3. Expose Argo CD qua Traefik (VPN only)

Middleware VPN only:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: vpn-only
  namespace: argocd
spec:
  ipAllowList:
    sourceRange:
      - 10.8.0.0/24
```

Ingress Argo CD:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: argocd-server-ingress
  namespace: argocd
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-http
    traefik.ingress.kubernetes.io/router.middlewares: argocd-vpn-only@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - argocd.company.com
      secretName: argocd-tls
  rules:
    - host: argocd.company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 80
```

---

## 15. NetworkPolicy — Namespace isolation

Namespace isolation mặc định của Kubernetes chỉ là logical. Cần NetworkPolicy để ngăn pod giữa các namespace communicate tuỳ tiện.

### 15.1. Deny all ingress mặc định cho mỗi namespace

```yaml
# Áp dụng cho namespace dev, uat, data
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: dev   # lặp lại cho uat, data
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

### 15.2. Cho phép app trong namespace truy cập DB của chính namespace đó

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dev-to-dev-db
  namespace: data
spec:
  podSelector:
    matchLabels:
      env: dev      # label trên DB pod
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: dev
```

Nguyên tắc: pod trong namespace `dev` chỉ được reach DB có label `env: dev` trong namespace `data`. Pod `uat` không reach được DB của `dev` và ngược lại.

---

## 16. Public app manifest mẫu

Deployment + Service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: public-web
  namespace: public
spec:
  replicas: 1
  selector:
    matchLabels:
      app: public-web
  template:
    metadata:
      labels:
        app: public-web
    spec:
      containers:
        - name: public-web
          image: your-registry/public-web:latest
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: public-web
  namespace: public
spec:
  selector:
    app: public-web
  ports:
    - port: 80
      targetPort: 80
```

Ingress public:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: public-web
  namespace: public
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-http
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - app.company.com
      secretName: public-web-tls
  rules:
    - host: app.company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: public-web
                port:
                  number: 80
```

---

## 17. Private DEV/UAT app manifest mẫu

Deployment + Service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uat-web
  namespace: uat
spec:
  replicas: 1
  selector:
    matchLabels:
      app: uat-web
  template:
    metadata:
      labels:
        app: uat-web
    spec:
      containers:
        - name: uat-web
          image: your-registry/uat-web:latest
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: uat-web
  namespace: uat
spec:
  selector:
    app: uat-web
  ports:
    - port: 80
      targetPort: 80
```

Middleware VPN only (tạo 1 lần cho mỗi namespace):

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: vpn-only
  namespace: uat
spec:
  ipAllowList:
    sourceRange:
      - 10.8.0.0/24
```

Ingress UAT:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: uat-web
  namespace: uat
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-http
    traefik.ingress.kubernetes.io/router.middlewares: uat-vpn-only@kubernetescrd
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - uat-app.company.com
      secretName: uat-web-tls
  rules:
    - host: uat-app.company.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: uat-web
                port:
                  number: 80
```

---

## 18. GitOps repo đề xuất

### 18.1. Cấu trúc tổng thể

```txt
infra-gitops
├── clusters
│   └── company-k3s
│       ├── root-app.yaml
│       ├── namespaces
│       ├── cert-manager
│       ├── argocd
│       ├── monitoring
│       ├── public
│       ├── dev
│       └── uat
│
├── apps
│   ├── web
│   │   ├── base
│   │   └── overlays
│   │       ├── public
│   │       ├── dev
│   │       └── uat
│   ├── api
│   │   ├── base
│   │   └── overlays
│   │       ├── public
│   │       ├── dev
│   │       └── uat
│   └── worker
│
└── platform
    ├── traefik-middlewares
    ├── network-policies
    ├── cluster-issuers
    ├── storage
    └── backup
```

---

### 18.2. Nếu dùng Helm chart chung

```txt
infra-gitops
├── charts
│   └── app-template
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates
│
├── environments
│   ├── public
│   │   ├── web-values.yaml
│   │   └── api-values.yaml
│   ├── dev
│   │   ├── web-values.yaml
│   │   └── api-values.yaml
│   └── uat
│       ├── web-values.yaml
│       └── api-values.yaml
│
└── argocd-apps
    ├── public-apps.yaml
    ├── dev-apps.yaml
    └── uat-apps.yaml
```

---

## 19. Flow CI/CD với Argo CD

Argo CD là CD/GitOps, không thay thế CI.

Cần thêm công cụ CI như:

```txt
GitHub Actions
GitLab CI
Gitea Actions
Jenkins
Azure DevOps Pipeline
```

Flow chuẩn:

```txt
Developer push code
   |
CI pipeline
   |
Build Docker image
   |
Push image lên registry
   |
Update image tag trong GitOps repo
   |
Argo CD phát hiện thay đổi
   |
Argo CD sync vào k3s
```

Mapping branch:

| Branch | Namespace | Domain | Public |
|---|---|---|---:|
| develop | dev | dev-app.company.com | Không |
| uat / release/* | uat | uat-app.company.com | Không |
| main | public | app.company.com | Có |

---

## 20. Argo CD Application mẫu

### 20.1. DEV app

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: dev-web
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/infra-gitops.git
    targetRevision: main
    path: environments/dev/web
  destination:
    server: https://kubernetes.default.svc
    namespace: dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: false   # DEV: tắt để developer có thể test kubectl apply trực tiếp
    syncOptions:
      - CreateNamespace=true
```

---

### 20.2. UAT app

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: uat-web
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/infra-gitops.git
    targetRevision: main
    path: environments/uat/web
  destination:
    server: https://kubernetes.default.svc
    namespace: uat
  syncPolicy:
    automated:
      prune: true
      selfHeal: true    # UAT: bật để giữ đúng trạng thái Git
    syncOptions:
      - CreateNamespace=true
```

---

### 20.3. Public app

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: public-web
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/infra-gitops.git
    targetRevision: main
    path: environments/public/web
  destination:
    server: https://kubernetes.default.svc
    namespace: public
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

---

## 21. Vai trò công cụ

| Công cụ | Vai trò |
|---|---|
| Argo CD | Deploy app theo GitOps, xem trạng thái app |
| k9s (local) | Quản trị cluster: exec pod, xem log, debug |
| kubectl (local) | Thao tác trực tiếp khi cần |
| Traefik | Route domain, TLS, middleware VPN only |
| cert-manager | Quản lý SSL |
| wg-easy | VPN access |
| GitOps repo | Source of truth cho manifest/Helm/Kustomize |

Nguyên tắc:

```txt
Không deploy app thủ công bằng kubectl nếu không commit vào GitOps repo.
Argo CD là nguồn triển khai chính.
k9s và kubectl chỉ dùng để observe, debug, emergency fix.
```

---

## 22. Data services

### 22.1. DEV/UAT database

Chạy trong k3s namespace `data`:

```txt
data namespace
├── dev-postgres
├── uat-postgres
├── dev-redis
└── uat-redis
```

Phù hợp với:

```txt
DEV
UAT
Demo nội bộ
Dữ liệu không quá quan trọng
Có backup định kỳ
```

---

### 22.2. Public production-like database

Nếu app public có user thật, cân nhắc:

```txt
Managed database (RDS, Supabase, PlanetScale...)
```

Hoặc nếu vẫn chạy trong k3s:

```txt
StatefulSet + PersistentVolume + backup CronJob nghiêm túc
```

Không expose DB ra Internet trong mọi trường hợp.

---

## 23. Storage

k3s mặc định có `local-path storage`.

Phù hợp với:

```txt
Single-node
DEV/UAT
Tool nội bộ
Database nhỏ
```

Cần lưu ý:

```txt
Volume nằm trên ổ đĩa server.
Server hỏng có thể mất dữ liệu nếu không backup.
Không phải mô hình HA.
```

Nếu cần ổn định hơn:

```txt
Longhorn
NFS
S3-compatible storage
Managed database
```

---

## 24. Monitoring và Logging

### 24.1. Giai đoạn đầu

```txt
metrics-server (mặc định trong k3s)
Uptime Kuma
kubectl top (qua VPN)
k9s resource view
```

### 24.2. Giai đoạn nâng cao

```txt
Prometheus
Grafana
Loki
Promtail
Alertmanager
```

Domain đề xuất:

```txt
grafana.company.com    # VPN only
uptime.company.com     # VPN only hoặc public tuỳ nhu cầu
```

---

## 25. Backup

Cần backup các phần sau:

```txt
/etc/rancher/k3s
/var/lib/rancher/k3s
wg-easy config (./etc_wireguard)
Persistent Volume
Database dump
GitOps repo
Argo CD admin secret
Argo CD repo credential
TLS secrets
```

Gợi ý công cụ:

```txt
restic + rclone -> S3/MinIO external
CronJob backup DB -> dump -> upload S3
```

Ví dụ CronJob backup DB:

```txt
data namespace
└── postgres-backup-cronjob
    └── pg_dump định kỳ
    └── upload lên S3/MinIO/backup server
```

---

## 26. Checklist triển khai

### Giai đoạn 1: Chuẩn bị server

- [ ] Cài Linux server (Ubuntu 22.04+).
- [ ] Cấu hình hostname, timezone.
- [ ] Cài Docker + Docker Compose.
- [ ] Cấu hình firewall UFW.
- [ ] Trỏ DNS về public IP server.

---

### Giai đoạn 2: VPN

- [ ] Cài wg-easy (pin version, dùng PASSWORD_HASH).
- [ ] Mở port `51820/udp`.
- [ ] Tạo user VPN.
- [ ] Test kết nối VPN, nhận IP `10.8.0.x`.
- [ ] Chỉ cho VPN truy cập SSH.

---

### Giai đoạn 3: k3s

- [ ] Cài k3s.
- [ ] Kiểm tra node/pod.
- [ ] Chỉ cho VPN truy cập Kubernetes API port `6443`.
- [ ] Tạo namespace chuẩn.
- [ ] Kiểm tra Traefik mặc định.

---

### Giai đoạn 4: k9s (máy local)

- [ ] Cài k9s trên máy local.
- [ ] Copy kubeconfig từ server, sửa endpoint về IP VPN.
- [ ] Bật VPN, test `kubectl get nodes`.
- [ ] Mở k9s, xác nhận thấy cluster.

---

### Giai đoạn 5: SSL

- [ ] Cài cert-manager.
- [ ] Tạo ClusterIssuer Let's Encrypt (staging trước).
- [ ] Test certificate cho một domain public.
- [ ] Chuyển sang production issuer.

---

### Giai đoạn 6: Argo CD

- [ ] Cài Argo CD qua Helm.
- [ ] Expose Argo CD qua Traefik.
- [ ] Gắn middleware VPN only.
- [ ] Test không VPN bị chặn.
- [ ] Test có VPN vào được.
- [ ] Kết nối GitOps repo.
- [ ] Tạo Application đầu tiên.

---

### Giai đoạn 7: NetworkPolicy

- [ ] Apply default-deny-ingress cho namespace dev, uat, data.
- [ ] Apply allow rule cho app reach đúng DB của môi trường mình.
- [ ] Test cross-namespace isolation.

---

### Giai đoạn 8: Public app

- [ ] Tạo namespace `public`.
- [ ] Deploy public app qua Argo CD.
- [ ] Tạo Ingress public, cấp SSL.
- [ ] Test user ngoài Internet vào được.

---

### Giai đoạn 9: DEV/UAT app

- [ ] Tạo namespace `dev`, `uat`.
- [ ] Deploy app qua Argo CD.
- [ ] Tạo middleware VPN only cho từng namespace.
- [ ] Tạo Ingress DEV/UAT.
- [ ] Test không VPN bị chặn.
- [ ] Test có VPN vào được.

---

### Giai đoạn 10: Monitoring/Logging

- [ ] Cài Uptime Kuma.
- [ ] Cài Prometheus/Grafana nếu cần.
- [ ] Cài Loki/Promtail nếu cần.
- [ ] Chặn monitoring bằng VPN only.

---

### Giai đoạn 11: Backup

- [ ] Backup wg-easy config.
- [ ] Backup k3s config.
- [ ] Backup database (CronJob).
- [ ] Backup Persistent Volume.
- [ ] Test restore ít nhất 1 lần.

---

## 27. Kiến trúc cuối cùng

```txt
Máy local (Admin/DevOps)
└── k9s / kubectl (qua VPN) -> quản trị cluster

Linux Server
├── wg-easy (Docker Compose)
│   ├── WireGuard port: 51820/udp
│   └── VPN subnet: 10.8.0.0/24
│
└── k3s
    ├── kube-system
    │   ├── traefik
    │   ├── coredns
    │   ├── metrics-server
    │   └── local-path-provisioner
    │
    ├── cert-manager
    │   └── letsencrypt cluster issuer
    │
    ├── argocd
    │   └── argo-cd
    │       └── argocd.company.com - VPN only
    │
    ├── public
    │   ├── public-web
    │   ├── public-api
    │   └── app.company.com / api.company.com - public
    │
    ├── dev
    │   ├── dev-web
    │   ├── dev-api
    │   └── dev-app.company.com - VPN only
    │
    ├── uat
    │   ├── uat-web
    │   ├── uat-api
    │   └── uat-app.company.com - VPN only
    │
    ├── monitoring
    │   ├── grafana       - VPN only
    │   ├── prometheus
    │   └── loki
    │
    └── data
        ├── dev-postgres / dev-redis
        ├── uat-postgres / uat-redis
        ├── minio
        └── backup cronjobs
```

---

## 28. Kết luận

```txt
k3s làm nền tảng chạy app.
Traefik làm Ingress chính.
wg-easy chạy ngoài k3s để làm VPN (pin version, dùng bcrypt password).
Argo CD triển khai GitOps/CD.
cert-manager cấp SSL.
k9s (local) thay thế Rancher để quản trị cluster qua VPN.
Public app mở qua HTTPS cho Internet.
DEV/UAT/Admin tools chỉ allow VPN subnet 10.8.0.0/24.
NetworkPolicy ngăn cross-namespace access giữa DB các môi trường.
DB/Redis không public.
Backup bắt buộc nếu chạy data trong cluster.
selfHeal=false cho DEV, selfHeal=true cho UAT/public.
```

Mô hình phù hợp cho server 8 CPU / 16 GB RAM, tiết kiệm ~2–3 GB RAM so với có Rancher, phù hợp team DevOps biết dùng kubectl/k9s.
