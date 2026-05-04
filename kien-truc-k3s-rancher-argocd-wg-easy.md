# Tài liệu kiến trúc triển khai DEV/UAT/Public Apps trên k3s

## 1. Mục tiêu

Triển khai một server Linux dùng **k3s** để chạy nhiều môi trường và ứng dụng:

- Một số app **public ra Internet** cho user sử dụng.
- Môi trường **DEV/UAT** chỉ truy cập được qua VPN.
- Công cụ quản trị như **Rancher**, **Argo CD**, **Grafana** chỉ truy cập qua VPN.
- Sử dụng **wg-easy** làm VPN.
- Sử dụng **Traefik** làm Ingress Controller, thay thế Nginx Proxy Manager.
- Sử dụng **Rancher** để quản trị Kubernetes cluster.
- Sử dụng **Argo CD** để triển khai CI/CD theo mô hình GitOps.

---

## 2. Stack công nghệ đề xuất

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| Linux Server | Máy chủ chạy toàn bộ hệ thống | Có thể dùng Ubuntu Server |
| k3s | Kubernetes nhẹ | Chạy toàn bộ workload |
| Traefik | Ingress Controller | Mặc định có trong k3s |
| wg-easy | VPN WireGuard có UI | Nên chạy ngoài k3s |
| Rancher | Giao diện quản trị Kubernetes | VPN only |
| Argo CD | GitOps/CD | VPN only |
| cert-manager | Quản lý SSL certificate | Dùng Let's Encrypt |
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
|  wg-easy                                            |
|  - WireGuard VPN                                    |
|  - VPN subnet: 10.8.0.0/24                          |
|  - Quản lý user VPN                                 |
|                                                     |
|  k3s                                                |
|  - Traefik Ingress                                  |
|  - Rancher                                          |
|  - Argo CD                                          |
|  - Public apps                                      |
|  - DEV apps                                         |
|  - UAT apps                                         |
|  - Monitoring tools                                 |
|  - Data services                                    |
-----------------------------------------------------
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
rancher.company.com
argocd.company.com
grafana.company.com
uptime.company.com
```

Luồng truy cập:

```txt
Admin bật VPN wg-easy
  -> nhận IP 10.8.0.x
  -> https://rancher.company.com
  -> Traefik Middleware VPN Only
  -> Rancher
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
| 6443 | TCP | 10.8.0.0/24 | Kubernetes API |

---

### 5.3. Port không public

Không public các port sau:

```txt
1433  - SQL Server
3306  - MySQL
5432  - PostgreSQL
6379  - Redis
3000  - Grafana backend
9090  - Prometheus
8080  - App internal ports
NodePort range
Rancher backend service
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

Giả sử dải VPN của wg-easy là:

```txt
10.8.0.0/24
```

Cấu hình:

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

# Kubernetes API only from VPN
sudo ufw allow from 10.8.0.0/24 to any port 6443 proto tcp

sudo ufw enable
sudo ufw status verbose
```

Nếu có IP tĩnh công ty và muốn cho IP đó SSH hoặc quản trị:

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
| rancher.company.com | Rancher UI | Có |
| argocd.company.com | Argo CD UI | Có |
| grafana.company.com | Grafana | Có |
| uptime.company.com | Uptime Kuma | Có |

---

## 8. Namespace thiết kế trong k3s

```txt
kube-system       # Thành phần mặc định của k3s
cert-manager      # Quản lý SSL certificate
cattle-system     # Rancher
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
kubectl create namespace cattle-system
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

Khi dùng kubeconfig từ máy cá nhân qua VPN, sửa:

```yaml
server: https://127.0.0.1:6443
```

thành:

```yaml
server: https://10.8.0.1:6443
```

Trong đó `10.8.0.1` là IP VPN của server.

---

## 10. wg-easy

### 10.1. Vị trí triển khai

Nên chạy `wg-easy` ngoài k3s bằng Docker Compose.

Lý do:

```txt
VPN là lớp truy cập hạ tầng.
Nếu k3s lỗi, vẫn cần VPN/SSH để vào server sửa cluster.
Nếu wg-easy nằm trong k3s mà cluster lỗi, có thể mất đường truy cập nội bộ.
```

Mô hình:

```txt
Linux Host
├── Docker Compose
│   └── wg-easy
└── k3s
```

---

### 10.2. Docker Compose mẫu cho wg-easy

```yaml
services:
  wg-easy:
    image: ghcr.io/wg-easy/wg-easy:latest
    container_name: wg-easy
    restart: unless-stopped
    environment:
      - WG_HOST=vpn.company.com
      - WG_PORT=51820
      - WG_DEFAULT_ADDRESS=10.8.0.x
      - WG_DEFAULT_DNS=1.1.1.1
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

Không expose Web UI của wg-easy ra Internet.

Nếu cần quản trị wg-easy UI:

```txt
Cách 1: Chỉ mở qua VPN
Cách 2: Dùng SSH tunnel
Cách 3: Expose qua Traefik nhưng bắt buộc VPN only
```

---

## 11. cert-manager

Cài cert-manager:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager   --namespace cert-manager   --set crds.enabled=true
```

ClusterIssuer Let's Encrypt mẫu:

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

---

## 12. Rancher

### 12.1. Vai trò Rancher

Rancher dùng để:

```txt
Quản trị cluster
Xem node/pod/workload
Quản lý user/RBAC
Lấy kubeconfig
Theo dõi tài nguyên
Hỗ trợ thao tác admin khi cần
```

Không nên dùng Rancher để deploy app thủ công hằng ngày. Việc deploy app nên do Argo CD quản lý.

---

### 12.2. Cài Rancher

```bash
helm repo add rancher-latest https://releases.rancher.com/server-charts/latest
helm repo update

kubectl create namespace cattle-system

helm install rancher rancher-latest/rancher   --namespace cattle-system   --set hostname=rancher.company.com   --set replicas=1   --set ingress.tls.source=letsEncrypt   --set letsEncrypt.email=admin@company.com   --set letsEncrypt.ingress.class=traefik
```

Với single-node k3s:

```txt
replicas=1
```

là phù hợp.

---

### 12.3. Chặn Rancher chỉ cho VPN

Tạo middleware:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: vpn-only
  namespace: cattle-system
spec:
  ipAllowList:
    sourceRange:
      - 10.8.0.0/24
```

Thêm annotation vào Ingress Rancher:

```yaml
traefik.ingress.kubernetes.io/router.middlewares: cattle-system-vpn-only@kubernetescrd
```

Kiểm tra Ingress Rancher:

```bash
kubectl get ingress -n cattle-system
kubectl edit ingress rancher -n cattle-system
```

---

## 13. Argo CD

### 13.1. Vai trò Argo CD

Argo CD dùng để triển khai ứng dụng theo mô hình GitOps.

Nguyên tắc:

```txt
GitOps repo là source of truth.
Argo CD đọc manifest/Helm/Kustomize từ Git.
Argo CD sync trạng thái trong Git vào cluster.
Không chỉnh sửa workload trực tiếp bằng tay nếu không cần.
```

---

### 13.2. Cài Argo CD

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

kubectl create namespace argocd

helm install argocd argo/argo-cd   --namespace argocd
```

---

### 13.3. Expose Argo CD qua Traefik

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

## 14. Public app manifest mẫu

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

## 15. Private DEV/UAT app manifest mẫu

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

Middleware VPN only:

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

## 16. GitOps repo đề xuất

### 16.1. Cấu trúc tổng thể

```txt
infra-gitops
├── clusters
│   └── company-k3s
│       ├── root-app.yaml
│       ├── namespaces
│       ├── cert-manager
│       ├── rancher
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
    ├── cluster-issuers
    ├── storage
    └── backup
```

---

### 16.2. Nếu dùng Helm chart chung

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

## 17. Flow CI/CD với Argo CD

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

## 18. Argo CD Application mẫu

### 18.1. DEV app

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
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

---

### 18.2. UAT app

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
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

---

### 18.3. Public app

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

## 19. Vai trò của Rancher và Argo CD

| Công cụ | Vai trò |
|---|---|
| Rancher | Quản trị cluster, user, RBAC, quan sát workload |
| Argo CD | Deploy app theo GitOps |
| Traefik | Route domain, TLS, middleware VPN only |
| cert-manager | Quản lý SSL |
| wg-easy | VPN access |
| GitOps repo | Source of truth cho manifest/Helm/Kustomize |

Nguyên tắc:

```txt
Không deploy app thủ công bằng Rancher UI nếu không cần.
Không sửa trực tiếp workload bằng kubectl nếu thay đổi đó không được commit vào GitOps repo.
Argo CD là nguồn triển khai chính.
Rancher là công cụ quản trị và quan sát.
```

---

## 20. Data services

### 20.1. DEV/UAT database

Có thể chạy trong k3s:

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

### 20.2. Public production-like database

Nếu app public có user thật dùng, nên cân nhắc:

```txt
Managed database như RDS
```

Hoặc nếu vẫn chạy trong k3s:

```txt
StatefulSet + PersistentVolume + backup CronJob nghiêm túc
```

Không expose DB ra Internet.

---

## 21. Storage

K3s mặc định có `local-path storage`.

Phù hợp với:

```txt
Single-node
DEV/UAT
Tool nội bộ
Database nhỏ
Upload file nhỏ
```

Cần lưu ý:

```txt
Volume nằm trên ổ đĩa server.
Server hỏng có thể mất dữ liệu nếu không backup.
Không phải mô hình HA.
```

Nếu cần ổn định hơn, cân nhắc:

```txt
Longhorn
NFS
S3-compatible storage
Managed database
```

---

## 22. Monitoring và Logging

### 22.1. Giai đoạn đầu

```txt
metrics-server
Rancher UI
Uptime Kuma
kubectl top
```

### 22.2. Giai đoạn nâng cao

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
uptime.company.com     # VPN only hoặc public tùy nhu cầu
```

---

## 23. Backup

Cần backup các phần sau:

```txt
/etc/rancher/k3s
/var/lib/rancher/k3s
wg-easy config
Persistent Volume
Database dump
GitOps repo
Rancher bootstrap password
Argo CD admin secret
Argo CD repo credential
TLS secrets nếu cần
```

Gợi ý công cụ:

```txt
restic
rclone
S3-compatible storage
MinIO external
CronJob backup DB
```

Ví dụ hướng backup DB:

```txt
data namespace
└── postgres-backup-cronjob
    └── dump DB định kỳ
    └── upload lên S3/MinIO/backup server
```

---

## 24. Checklist triển khai

### Giai đoạn 1: Chuẩn bị server

- Cài Linux server.
- Cấu hình hostname.
- Cấu hình timezone.
- Cài Docker Compose để chạy wg-easy.
- Cấu hình firewall/security group.
- Trỏ DNS về public IP server.

---

### Giai đoạn 2: VPN

- Cài wg-easy.
- Mở port `51820/udp`.
- Tạo user VPN.
- Test kết nối VPN.
- Kiểm tra IP VPN `10.8.0.x`.
- Chỉ cho VPN truy cập SSH.

---

### Giai đoạn 3: k3s

- Cài k3s.
- Kiểm tra node/pod.
- Chỉ cho VPN truy cập Kubernetes API port `6443`.
- Tạo namespace chuẩn.
- Kiểm tra Traefik mặc định.

---

### Giai đoạn 4: SSL

- Cài cert-manager.
- Tạo ClusterIssuer Let's Encrypt.
- Test certificate cho một domain public.

---

### Giai đoạn 5: Rancher

- Cài Rancher qua Helm.
- Expose Rancher qua Traefik.
- Gắn middleware VPN only.
- Test không VPN bị chặn.
- Test có VPN vào được.

---

### Giai đoạn 6: Argo CD

- Cài Argo CD qua Helm.
- Expose Argo CD qua Traefik.
- Gắn middleware VPN only.
- Kết nối GitOps repo.
- Tạo Application đầu tiên.

---

### Giai đoạn 7: Public app

- Tạo namespace `public`.
- Deploy public app qua Argo CD.
- Tạo Ingress public.
- Cấp SSL.
- Test user ngoài Internet vào được.

---

### Giai đoạn 8: DEV/UAT app

- Tạo namespace `dev`, `uat`.
- Deploy app qua Argo CD.
- Tạo middleware VPN only.
- Tạo Ingress DEV/UAT.
- Test không VPN bị chặn.
- Test có VPN vào được.

---

### Giai đoạn 9: Monitoring/Logging

- Cài Uptime Kuma.
- Cài Prometheus/Grafana nếu cần.
- Cài Loki/Promtail nếu cần.
- Chặn monitoring bằng VPN only.

---

### Giai đoạn 10: Backup

- Backup wg-easy config.
- Backup k3s config.
- Backup database.
- Backup Persistent Volume.
- Backup GitOps repo.
- Test restore định kỳ.

---

## 25. Kiến trúc cuối cùng

```txt
Linux Server
├── wg-easy
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
    ├── cattle-system
    │   └── rancher
    │       └── rancher.company.com - VPN only
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
    │   ├── grafana
    │   ├── prometheus
    │   └── loki
    │
    └── data
        ├── postgres / mysql / sqlserver
        ├── redis
        ├── minio
        └── backup cronjobs
```

---

## 26. Kết luận

Kiến trúc khuyến nghị:

```txt
k3s làm nền tảng chạy app.
Traefik làm Ingress chính.
wg-easy chạy ngoài k3s để làm VPN.
Rancher dùng để quản trị cluster.
Argo CD dùng để triển khai GitOps/CD.
cert-manager dùng để cấp SSL.
Public app mở qua HTTPS cho Internet.
DEV/UAT/Admin tools chỉ allow VPN subnet 10.8.0.0/24.
DB/Redis không public.
Backup là bắt buộc nếu chạy data trong cluster.
```

Đây là mô hình phù hợp cho một server Linux công ty, có thể chạy DEV/UAT và một số app public, nhưng vẫn giữ được hướng triển khai chuẩn Kubernetes.
