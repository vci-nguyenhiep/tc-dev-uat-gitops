# Phase 05 — ArgoCD + GitHub GitOps

## Lỗi đã gặp

### Lỗi 1 — repo-server crash loop

**Triệu chứng:** ArgoCD báo `Unable to sync: error resolving repo revision: connection refused` ở port 8081.

**Nguyên nhân:** ArgoCD mặc định cấu hình liveness probe của `argocd-repo-server` như sau:
```
path: /healthz?full=true
timeoutSeconds: 1
failureThreshold: 3
```
Endpoint `?full=true` kiểm tra kết nối tới **tất cả Git repos** mỗi lần check — khi có nhiều apps (20+) đang sync đồng thời, check này tốn > 1 giây. Kubernetes coi là fail, sau 3 lần liên tiếp → kill pod → restart → trong lúc pod khởi động lại thì các app gọi tới port 8081 bị `connection refused`.

**Fix:** Dùng `/healthz` (không `full=true`) cho liveness probe. Liveness chỉ cần biết process còn sống, không cần check repo connectivity. Readiness probe giữ nguyên `full=true`.

Config fix đã được đưa vào `configs/argocd/argocd-values.yaml`.

### Lỗi 2 — "revision main must be resolved" khi refresh

**Triệu chứng:** ArgoCD UI hiện `Unable to load data: revision main must be resolved` ngắt quãng khi bấm Refresh.

**Nguyên nhân:** ISP DNS đôi khi trả về IP `125.235.4.59` cho `github.com` — IP này bị `connection refused` từ trong cluster. Khi git fetch fail → repo-server không resolve được revision → lỗi lan sang toàn bộ app đang dùng repo đó.

**Fix:** Đã xử lý ở **Phase 03 - Bước 3b** — CoreDNS override `github.com` dùng Google/Cloudflare DNS. Phải chạy bước đó **trước khi** cài ArgoCD.

---

## Bước 1: Cài ArgoCD

```bash
# Cài đặt Helm (nếu chưa có):
curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
```

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo update

# Dùng values file — bao gồm fix liveness probe cho repo-server
helm install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  -f configs/argocd/argocd-values.yaml
```

Kiểm tra:

```bash
# Nếu xảy ra lỗi permission denied khi Helm tạo service account,
# có thể do KUBECONFIG chưa set đúng hoặc không có quyền admin trên cluster.
source ~/.bashrc
echo $KUBECONFIG

# Nếu KUBECONFIG vẫn rỗng thì set trực tiếp:
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
helm install argocd argo/argo-cd \
  --namespace argocd \
  --create-namespace \
  -f configs/argocd/argocd-values.yaml

# Kiểm tra pods — tất cả phải Running, RESTARTS phải thấp
kubectl get pods -n argocd
# argocd-server-xxx                Running
# argocd-repo-server-xxx           Running   ← nếu RESTARTS tăng liên tục = lỗi probe
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

### Cách 2: Webhook (ngay lập tức) — Cần expose endpoint + cấu hình GitHub

Webhook giúp ArgoCD nhận thông báo ngay khi có push, không cần chờ 3 phút.

> **Phân biệt chiều traffic — đừng nhầm:**
> - ArgoCD **pull** repo từ GitHub = **outbound**, KHÔNG cần publish gì (đã chạy qua polling).
> - Webhook = GitHub **gọi vào** ArgoCD = **inbound**. GitHub server nằm trên internet
>   công cộng → phải hở endpoint `/api/webhook` ra net thì GitHub mới POST vào được.
>
> IngressRoute chính (`argocd-ingress.yaml`) đang gắn `vpn-only` → GitHub không vào được.
> **Không bỏ `vpn-only`** (sẽ phơi cả UI admin ra net). Thay vào đó hở RIÊNG path webhook.

**Điều kiện hạ tầng (kiểm tra trước):**
- `tc-argocd.vcijsc.com` resolve **public** ra IP public của server.
- Firewall mở **443 inbound từ internet** (hiện có thể chỉ mở cho VPN).
- Cert `argocd-tls` hợp lệ (đã có từ phase 04).

**Bước cấu hình webhook:**

1. Apply IngressRoute webhook-only (hở đúng path `/api/webhook`, không gắn `vpn-only`):
```bash
kubectl apply -f configs/argocd/argocd-webhook-ingress.yaml
```

2. Set secret token (HMAC — đây là lớp bảo mật chính của endpoint này):
```bash
# Tạo secret ngẫu nhiên mạnh
WEBHOOK_SECRET=$(openssl rand -hex 32)

kubectl patch secret argocd-secret -n argocd \
  -p "{\"stringData\": {\"webhook.github.secret\": \"$WEBHOOK_SECRET\"}}"

echo "Secret để dán vào GitHub: $WEBHOOK_SECRET"
```

3. Trên GitHub repo → Settings → Webhooks → Add webhook:
   - Payload URL: `https://tc-argocd.vcijsc.com/api/webhook`
   - Content type: `application/json`
   - Secret: (secret từ bước 2)
   - Events: `Just the push event`
   - Click `Add webhook`

4. Verify: sau khi Add, GitHub gửi 1 ping. Vào tab **Recent Deliveries** của webhook
   → phải thấy response `200`. Nếu `403`/timeout → kiểm tra firewall 443 + public DNS.

Sau khi setup, mỗi khi push lên GitHub → ArgoCD sync ngay lập tức (< 5 giây).

> **Bảo mật:** Endpoint chỉ trigger refresh repo, không lộ data. ArgoCD verify
> `X-Hub-Signature` bằng secret → request không có chữ ký đúng bị reject. KHÔNG dùng
> IP allowlist theo IP GitHub được vì klipper-lb MASQUERADE source IP (xem comment
> trong `configs/argocd/argocd-webhook-ingress.yaml`).

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
