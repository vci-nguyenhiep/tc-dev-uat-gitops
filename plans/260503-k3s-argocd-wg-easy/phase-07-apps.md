# Phase 07 — App Deployment via GitOps + AWS ECR

## Lưu ý quan trọng về ECR

ECR token **hết hạn sau 12 giờ** — khác Docker Hub (credential tĩnh).
Cần CronJob chạy mỗi 6 giờ để refresh imagePullSecret trong cluster.

---

## Bước 1: Apply VPN middlewares

```bash
kubectl apply -f configs/apps/vpn-middleware-dev.yaml
kubectl apply -f configs/apps/vpn-middleware-uat.yaml
```

---

## Bước 2: Chuẩn bị AWS ECR

### 2.1 Tạo ECR repository (AWS Console hoặc CLI)

```bash
# Tạo ECR repo cho từng app
for APP in admin wms hrm ims cms; do
  aws ecr create-repository --repository-name $APP --region ap-southeast-1
done
```

URL format của ECR image:
```
<ACCOUNT_ID>.dkr.ecr.<REGION>.amazonaws.com/<REPO_NAME>:<TAG>
# Ví dụ:
123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/admin:abc1234
123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/wms:abc1234
```

### 2.2 Tạo IAM User cho k3s pull image

Trong AWS Console → IAM → Users → Create User: `k3s-ecr-puller`

Gán policy inline:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "*"
    }
  ]
}
```

Tạo Access Key cho user này → lưu `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY`.

### 2.3 Tạo IAM User cho CI push image

User: `github-actions-ecr-pusher` với policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:<REGION>:<ACCOUNT_ID>:repository/*"
    }
  ]
}
```

---

## Bước 3: Setup ECR imagePullSecret trong k3s

### 3.1 Lưu AWS credentials của k3s puller vào cluster

Sửa giá trị thực trong file template, sau đó apply:

```bash
vim configs/secrets/aws-ecr-credentials.yaml
# Thay: CHANGE_ME_ACCESS_KEY_ID, CHANGE_ME_SECRET_ACCESS_KEY, CHANGE_ME_ACCOUNT_ID

kubectl apply -f configs/secrets/aws-ecr-credentials.yaml
```

> **KHÔNG commit** file này lên Git sau khi đã điền credentials thật.

### 3.2 Tạo imagePullSecret lần đầu (thủ công)

```bash
# Lấy token ECR (hợp lệ 12 giờ)
AWS_ACCESS_KEY_ID=YOUR_KEY \
AWS_SECRET_ACCESS_KEY=YOUR_SECRET \
aws ecr get-login-password --region ap-southeast-1 | \
docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.ap-southeast-1.amazonaws.com

# Tạo secret cho từng namespace
ECR_TOKEN=$(AWS_ACCESS_KEY_ID=YOUR_KEY \
  AWS_SECRET_ACCESS_KEY=YOUR_SECRET \
  aws ecr get-login-password --region ap-southeast-1)

for NS in dev uat public; do
  kubectl create secret docker-registry ecr-secret \
    --namespace $NS \
    --docker-server=123456789012.dkr.ecr.ap-southeast-1.amazonaws.com \
    --docker-username=AWS \
    --docker-password=$ECR_TOKEN
done
```
Hoặc chạy file [plans\260503-k3s-argocd-wg-easy\configs\secrets\ecr-secret.sh] đã có sẵn script tạo secret — chỉ cần điền credentials thật vào file trước khi chạy.

### 3.3 Tạo RBAC cho CronJob refresh token

```yaml
# Lưu vào file: configs/ecr/ecr-token-refresh-rbac.yaml
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ecr-token-refresh
  namespace: kube-system

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: ecr-token-refresh
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["get", "create", "patch", "update", "delete"]

---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ecr-token-refresh
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: ecr-token-refresh
subjects:
  - kind: ServiceAccount
    name: ecr-token-refresh
    namespace: kube-system
```

```bash
kubectl apply -f configs/ecr/ecr-token-refresh-rbac.yaml
```

### 3.4 Tạo CronJob tự refresh ECR token mỗi 6 giờ

```yaml
# Lưu vào file: configs/ecr/ecr-token-refresh-cronjob.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ecr-token-refresh
  namespace: kube-system
spec:
  schedule: "0 */6 * * *"   # Mỗi 6 giờ — token hết hạn sau 12h
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          serviceAccountName: ecr-token-refresh
          restartPolicy: OnFailure
          hostNetwork: true
          containers:
            - name: refresh
              image: amazon/aws-cli:latest
              command:
                - /bin/sh
                - -c
                - |
                  # Lấy ECR token mới
                  TOKEN=$(aws ecr get-login-password --region $AWS_DEFAULT_REGION)

                  # Refresh secret trong từng namespace
                  for NS in dev uat public; do
                    kubectl create secret docker-registry ecr-secret \
                      --namespace $NS \
                      --docker-server=$ECR_REGISTRY \
                      --docker-username=AWS \
                      --docker-password=$TOKEN \
                      --dry-run=client -o yaml | kubectl apply -f -
                    echo "Refreshed ecr-secret in namespace: $NS"
                  done
              envFrom:
                - secretRef:
                    name: aws-ecr-credentials
              volumeMounts:
                - name: kubectl
                  mountPath: /usr/local/bin/kubectl
          volumes:
            - name: kubectl
              hostPath:
                path: /usr/local/bin/kubectl
                type: File
```

```bash
kubectl apply -f configs/ecr/ecr-token-refresh-cronjob.yaml

# Test chạy ngay (không cần đợi lịch)
kubectl create job ecr-token-refresh-manual \
  --from=cronjob/ecr-token-refresh \
  -n kube-system

# Xem log để verify
kubectl logs job/ecr-token-refresh-manual -n kube-system
```

---

## Bước 4: Tạo GitOps repo trên GitHub

Mỗi app có **thư mục riêng** — ArgoCD watch độc lập từng folder. CI chỉ update đúng folder của app mình.

```
infra-gitops/
├── argocd-apps/                      ← Apply 1 lần khi setup
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
│   │   ├── admin/deployment.yaml     ← Deployment + Service + Ingress
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

Xem file mẫu đầy đủ trong `gitops-repo-example/` của plan này.

Trong mỗi `deployment.yaml`, dùng image từ ECR + imagePullSecret:

```yaml
imagePullSecrets:
  - name: ecr-secret         # CronJob tự refresh mỗi 6 giờ
containers:
  - name: admin              # tên app
    image: 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/admin:latest
```

---

## Bước 5: Apply app secrets (trước khi deploy)

Pods tham chiếu `app-dev-secret` và `app-uat-secret` — phải tồn tại trước khi pod khởi động.

```bash
# Sửa values thực trong file trước
vim configs/secrets/app-dev-secret.yaml   # POSTGRES_PASSWORD, REDIS_PASSWORD, JWT_SECRET...
vim configs/secrets/app-uat-secret.yaml

# Apply (KHÔNG commit lên Git sau khi đã điền values thật)
kubectl apply -f configs/secrets/app-dev-secret.yaml
kubectl apply -f configs/secrets/app-uat-secret.yaml
```

Verify:

```bash
kubectl get secret app-dev-secret -n dev
kubectl get secret app-uat-secret -n uat
```

---

## Bước 6: Apply ArgoCD Applications

```bash
# Sửa YOUR_ORG thành GitHub org thực của bạn (1 lần duy nhất khi setup)
for F in gitops-repo-example/argocd/*.yaml; do
  sed 's/YOUR_ORG/your-github-org/g' $F | kubectl apply -f -
done
```

Sau khi apply, ArgoCD tự sync các app từ Git. Kiểm tra:

```bash
kubectl get applications -n argocd
# NAME        SYNC STATUS   HEALTH STATUS
# dev-admin   Synced        Healthy
# dev-wms     Synced        Healthy
# dev-hrm     Synced        Healthy
# dev-ims     Synced        Healthy
# dev-cms     Synced        Healthy
# uat-admin   Synced        Healthy
# uat-wms     Synced        Healthy
# uat-hrm     Synced        Healthy
# uat-ims     Synced        Healthy
# uat-cms     Synced        Healthy
```

---

## Bước 6: Tạo Ingress cho apps

```bash
# Ví dụ cho dev-web
cp configs/apps/dev-ingress-template.yaml /tmp/dev-web-ingress.yaml
sed -i 's/APP_NAME/web/g' /tmp/dev-web-ingress.yaml
sed -i 's/SUBDOMAIN/dev-app/g' /tmp/dev-web-ingress.yaml
kubectl apply -f /tmp/dev-web-ingress.yaml
```

---

## Bước 7: Verify deployment

```bash
# ArgoCD Applications
kubectl get applications -n argocd

# Pods
kubectl get pods -n dev
kubectl get pods -n uat
kubectl get pods -n public

# ECR secrets có đúng không
kubectl get secret ecr-secret -n dev -o yaml
```

---

## Bước 8: Test truy cập

```bash
# Bật VPN → test DEV/UAT
curl -k https://dev-app.company.com
curl -k https://uat-app.company.com

# Test public (không cần VPN)
curl https://app.company.com

# Test block khi không có VPN
curl https://dev-app.company.com
# Phải bị 403 Forbidden
```

---

## Flow CI/CD hoàn chỉnh với ECR

```
1. Developer push code lên branch develop
2. GitHub Actions trigger:
   a. Login ECR bằng github-actions-ecr-pusher credentials
   b. Build Docker image
   c. Push: 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com/my-app-web:git-sha
   d. Update image tag trong infra-gitops repo
3. ArgoCD phát hiện thay đổi → sync vào namespace dev
4. k3s pull image từ ECR (dùng ecr-secret được CronJob refresh)
5. Pod mới replace pod cũ (rolling update)
```

---

## GitHub Actions workflow mẫu

Mỗi app repo có workflow riêng. Chỉ cần thay `ECR_REPOSITORY` và `GITOPS_APP_PATH` theo từng app.

```yaml
# Đặt trong từng app repo — ví dụ: admin/.github/workflows/deploy-dev.yml
# Copy workflow này cho wms, hrm, ims, cms — chỉ đổi 2 dòng env bên dưới
name: Deploy to DEV

on:
  push:
    branches: [develop]

env:
  AWS_REGION: ap-southeast-1
  ECR_REGISTRY: 123456789012.dkr.ecr.ap-southeast-1.amazonaws.com
  ECR_REPOSITORY: admin                  # ← đổi theo app: admin | wms | hrm | ims | cms
  GITOPS_APP_PATH: environments/dev/admin # ← đổi theo app + env

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        run: |
          IMAGE="${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:${{ github.sha }}"
          docker build -t $IMAGE .
          docker push $IMAGE
          echo "IMAGE=$IMAGE" >> $GITHUB_ENV

      - name: Update GitOps repo
        run: |
          git clone https://x-access-token:${{ secrets.GITOPS_TOKEN }}@github.com/YOUR_ORG/infra-gitops.git
          cd infra-gitops
          # Chỉ update đúng folder của app này — app khác không bị ảnh hưởng
          sed -i "s|image: ${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:.*|image: ${{ env.IMAGE }}|" \
            ${{ env.GITOPS_APP_PATH }}/deployment.yaml
          git config user.email "ci@company.com"
          git config user.name "CI Bot"
          git add ${{ env.GITOPS_APP_PATH }}/deployment.yaml
          git commit -m "chore(dev): update ${{ env.ECR_REPOSITORY }} to ${{ github.sha }}"
          git push
```

**Mapping `ECR_REPOSITORY` + `GITOPS_APP_PATH` — copy bảng này vào mỗi workflow:**

| App repo | Branch | ECR_REPOSITORY | GITOPS_APP_PATH | ArgoCD app sync |
|---|---|---|---|---|
| admin | develop | `admin` | `environments/dev/admin` | `dev-admin` |
| admin | uat | `admin` | `environments/uat/admin` | `uat-admin` |
| wms | develop | `wms` | `environments/dev/wms` | `dev-wms` |
| wms | uat | `wms` | `environments/uat/wms` | `uat-wms` |
| hrm | develop | `hrm` | `environments/dev/hrm` | `dev-hrm` |
| hrm | uat | `hrm` | `environments/uat/hrm` | `uat-hrm` |
| ims | develop | `ims` | `environments/dev/ims` | `dev-ims` |
| ims | uat | `ims` | `environments/uat/ims` | `uat-ims` |
| cms | develop | `cms` | `environments/dev/cms` | `dev-cms` |
| cms | uat | `cms` | `environments/uat/cms` | `uat-cms` |

> `GITOPS_TOKEN` là GitHub PAT có quyền write vào `infra-gitops` repo (khác `GITHUB_TOKEN` mặc định vì cần push sang repo khác).

---

## GitHub Actions Secrets cần tạo

| Secret | Giá trị |
|---|---|
| `AWS_ACCESS_KEY_ID` | Access Key của `github-actions-ecr-pusher` |
| `AWS_SECRET_ACCESS_KEY` | Secret Key của `github-actions-ecr-pusher` |
| `GITOPS_TOKEN` | GitHub PAT có quyền write vào `infra-gitops` repo |
