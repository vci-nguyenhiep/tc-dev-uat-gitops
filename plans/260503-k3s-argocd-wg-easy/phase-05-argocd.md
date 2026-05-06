# Phase 05 — ArgoCD + GitHub GitOps

## Bước 1: Cài ArgoCD

```bash
cài đặt Helm (nếu chưa có):
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
```

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

helm install argocd argo/argo-cd \
  --namespace argocd \
  --set configs.params."server\.insecure"=true   # Traefik xử lý TLS, ArgoCD dùng HTTP nội bộ
```

Kiểm tra:

```bash
Nếu xảy ra lỗi permission denied khi Helm tạo service account, có thể do KUBECONFIG chưa set đúng hoặc không có quyền admin trên cluster.
source ~/.bashrc
echo $KUBECONFIG

Nếu KUBECONFIG vẫn rỗng thì set trực tiếp trong session hiện tại:

export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm install argocd argo/argo-cd \
  --namespace argocd \
  --set server.insecure=true

rồi kiểm tra lại:
kubectl get pods -n argocd
# argocd-server-xxx                Running
# argocd-repo-server-xxx           Running
# argocd-application-controller-xxx Running
# argocd-dex-server-xxx            Running
# argocd-redis-xxx                 Running
```

## Bước 2: Lấy admin password
Không thể truy cập từ bên ngoài mà phải port-forward để lấy password:

```bash
kubectl port-forward service/argocd-server -n argocd 8080:80
```

Lấy mật khẩu admin:
```bash
kubectl get secret argocd-initial-admin-secret \
  -n argocd \
  -o jsonpath="{.data.password}" | base64 -d
echo ""
```

Lưu password này lại. Sẽ đổi sau.

## Bước 3: Apply middleware và Ingress

```bash
kubectl apply -f configs/argocd/vpn-middleware.yaml
kubectl apply -f configs/argocd/argocd-ingress.yaml
```

## Bước 4: Truy cập ArgoCD UI

### Chú ý: Phải quay về phase 04 để cài cert-manager và Traefik trước, vì ArgoCD Ingress phụ thuộc vào Traefik Middleware đã tạo ở phase 04.

Bật VPN, mở trình duyệt: `https://argocd.company.com`

Đăng nhập:
- Username: `admin`
- Password: (lấy từ bước 2)

## Bước 5: Cài ArgoCD CLI trên máy local + Đổi admin password

### Cài ArgoCD CLI

**Windows (PowerShell — chạy với quyền Admin):**
```powershell
# Option A: Chocolatey
choco install argocd

# Option B: Download thủ công
$version = (Invoke-RestMethod "https://api.github.com/repos/argoproj/argo-cd/releases/latest").tag_name
Invoke-WebRequest -Uri "https://github.com/argoproj/argo-cd/releases/download/$version/argocd-windows-amd64.exe" -OutFile argocd.exe
Move-Item argocd.exe C:\Windows\System32\argocd.exe
```

**macOS:**
```bash
brew install argocd
```

**Linux:**
```bash
VERSION=$(curl -L -s https://raw.githubusercontent.com/argoproj/argo-cd/stable/VERSION)
curl -sSL -o /usr/local/bin/argocd \
  https://github.com/argoproj/argo-cd/releases/download/v${VERSION}/argocd-linux-amd64
chmod +x /usr/local/bin/argocd
```

Verify (tất cả OS):
```bash
argocd version --client
```

### Login và đổi password (bật VPN trước)

```bash
# Login vào ArgoCD
argocd login argocd.company.com --username admin --password <password-từ-bước-2>

# Đổi password
argocd account update-password
```

Hoặc đổi qua UI: User Info → Update Password

## Bước 6: Tạo GitOps repo trên GitHub

Tạo repo mới trên GitHub, ví dụ: `your-org/infra-gitops`

Cấu trúc repo:

```
infra-gitops/
├── platform/
│   ├── cert-manager/
│   ├── traefik-middlewares/
│   └── network-policies/
├── environments/
│   ├── dev/
│   │   ├── web-values.yaml
│   │   └── api-values.yaml
│   ├── uat/
│   │   ├── web-values.yaml
│   │   └── api-values.yaml
│   └── public/
│       ├── web-values.yaml
│       └── api-values.yaml
└── argocd-apps/
    ├── dev-apps.yaml
    ├── uat-apps.yaml
    └── public-apps.yaml
```

Xem thư mục `gitops-repo-example/` trong plan này để có cấu trúc đầy đủ.

## Bước 7: Kết nối ArgoCD với GitHub repo

### Option A: Repo public (không cần credential)

Không cần làm gì thêm, ArgoCD đọc được trực tiếp.

### Option B: Repo private (cần GitHub token)

Tạo GitHub Personal Access Token:
1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. Quyền: `Contents: Read-only`
3. Copy token

Kết nối repo trong ArgoCD UI:
1. Settings → Repositories → Connect Repo
2. Connection method: HTTPS
3. Repository URL: `https://github.com/your-org/infra-gitops.git`
4. Username: your-github-username
5. Password: (GitHub token)
6. Click Connect

Hoặc qua CLI:

```bash
argocd repo add https://github.com/your-org/infra-gitops.git \
  --username your-github-username \
  --password <GITHUB_TOKEN>
```

## Bước 8: ArgoCD tự động sync khi GitHub thay đổi

ArgoCD có 2 cách phát hiện thay đổi từ GitHub:

### Cách 1: Polling (mặc định) — Đơn giản, không cần cấu hình thêm

ArgoCD tự động poll GitHub repo mỗi **3 phút**.

```
Developer push code lên GitHub
  ↓ (max 3 phút)
ArgoCD phát hiện thay đổi
  ↓
ArgoCD sync vào k3s cluster
```

Đây là cách mặc định, không cần setup thêm gì.

### Cách 2: Webhook (ngay lập tức) — Cần cấu hình GitHub

Webhook giúp ArgoCD nhận thông báo ngay khi có push, không cần chờ 3 phút.

**Bước cấu hình webhook:**

1. Lấy secret token:
```bash
kubectl get secret argocd-secret -n argocd \
  -o jsonpath="{.data.webhook\.github\.secret}" | base64 -d
```

Nếu chưa có, set secret:
```bash
kubectl patch secret argocd-secret -n argocd \
  -p '{"stringData": {"webhook.github.secret": "your-webhook-secret"}}'
```

2. Trên GitHub repo → Settings → Webhooks → Add webhook:
   - Payload URL: `https://argocd.company.com/api/webhook`
   - Content type: `application/json`
   - Secret: (secret từ bước trên)
   - Events: `Just the push event`
   - Click `Add webhook`

Sau khi setup webhook, mỗi khi push lên GitHub → ArgoCD sync ngay lập tức (< 5 giây).

## Bước 9: Tạo ArgoCD Application đầu tiên

Xem file mẫu trong `configs/apps/argocd-app-dev.yaml`, `argocd-app-uat.yaml`, `argocd-app-public.yaml`.

Apply:

```bash
kubectl apply -f configs/apps/argocd-app-dev.yaml
kubectl apply -f configs/apps/argocd-app-uat.yaml
kubectl apply -f configs/apps/argocd-app-public.yaml
```

## Verify

```bash
# Kiểm tra ArgoCD apps
kubectl get applications -n argocd

# Trong k9s: :applications
# Hoặc trong ArgoCD UI xem trạng thái Synced/Healthy
```

## Flow hoàn chỉnh khi deploy app mới

```
1. Developer push code lên app repo (branch: develop)
2. CI pipeline (GitHub Actions/GitLab CI) build Docker image
3. CI push image lên Docker Hub: docker.io/username/app:sha-abc123
4. CI cập nhật image tag trong GitOps repo (infra-gitops):
   environments/dev/web-values.yaml: image.tag: sha-abc123
5. ArgoCD phát hiện thay đổi (polling 3min hoặc webhook ngay lập tức)
6. ArgoCD apply manifest mới vào namespace dev trong k3s
7. Pod mới được tạo với image sha-abc123
```
