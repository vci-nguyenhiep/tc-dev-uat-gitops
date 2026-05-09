# Phase 06 — HashiCorp Vault + Vault Secrets Operator (VSO)

## Tổng quan

Vault chạy in-cluster (k3s, namespace `vault`), Vault Secrets Operator (VSO) tự động sync
secrets từ Vault → k8s Secrets để pod dùng như bình thường.

```
Vault (namespace: vault, Raft storage)
  ↑  Kubernetes Auth (ServiceAccount JWT)
VSO watch VaultStaticSecret CRD
  ↓  sync
k8s Secret (data/dev/uat/kube-system namespace)
  ↓  mount
App pods (envFrom secretRef)
```

**Secret structure trong Vault (KV v2):**

```
secret/
├── data/
│   ├── redis       → redis-dev-secret    (namespace: data)
├── dev/
│   └── app              → app-dev-secret      (namespace: dev)
├── uat/
│   └── app              → app-uat-secret      (namespace: uat)
└── shared/
    └── aws-ecr          → aws-ecr-credentials (namespace: kube-system)
```

**Thời gian ước tính:** 45 phút

---

## Bước 1: DNS + Namespace

Thêm A record DNS trỏ về public IP server:

```
vault.company.com  →  <SERVER_PUBLIC_IP>
```

Tạo namespace:

```bash
kubectl create namespace vault
```

---

## Bước 2: Install Vault via Helm

```bash
helm repo add hashicorp https://helm.releases.hashicorp.com
helm repo update

helm install vault hashicorp/vault \
  --namespace vault \
  --set server.standalone.enabled=true \
  --set server.dataStorage.enabled=true \
  --set server.dataStorage.size=5Gi \
  --set server.dataStorage.storageClass=local-path \
  --set ui.enabled=true \
  --set ui.serviceType=ClusterIP
```

Nếu bị lỗi `Error: INSTALLATION FAILED: Kubernetes cluster unreachable: Get "http://localhost:8080/version": dial tcp [::1]:8080: connect: connection refused`, chạy lệnh sau để fix:

```bash
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
source ~/.bashrc
```
Chờ pod khởi động (status `0/1 Running` là bình thường — Vault chưa unseal):

```bash
kubectl get pods -n vault
# vault-0   0/1   Running   0   60s
```

---

## Bước 3: Init Vault (chỉ làm 1 lần duy nhất)

```bash
# Chờ pod sẵn sàng nhận init
kubectl wait --for=condition=Initialized pod/vault-0 -n vault --timeout=120s

# Init với 5 key shares, threshold 3
kubectl exec vault-0 -n vault -- vault operator init \
  -key-shares=5 \
  -key-threshold=3 \
  -format=json > vault-init.json

cat vault-init.json
```

> **QUAN TRỌNG — Đọc kỹ trước khi tiếp tục:**
> - File `vault-init.json` chứa 5 unseal keys + root token.
> - Lưu vào **password manager** hoặc **offline storage** an toàn.
> - **TUYỆT ĐỐI KHÔNG** commit file này lên Git.
> - Mất file này = mất quyền truy cập Vault vĩnh viễn.

---

## Bước 4: Unseal Vault

Cài `jq` nếu chưa có:

```bash
sudo apt-get install -y jq
```

Cần đủ 3 trong 5 unseal keys:

```bash
UNSEAL_KEY_1=$(cat vault-init.json | jq -r '.unseal_keys_b64[0]')
UNSEAL_KEY_2=$(cat vault-init.json | jq -r '.unseal_keys_b64[1]')
UNSEAL_KEY_3=$(cat vault-init.json | jq -r '.unseal_keys_b64[2]')

kubectl exec vault-0 -n vault -- vault operator unseal $UNSEAL_KEY_1
kubectl exec vault-0 -n vault -- vault operator unseal $UNSEAL_KEY_2
kubectl exec vault-0 -n vault -- vault operator unseal $UNSEAL_KEY_3
```

Kiểm tra:

```bash
kubectl exec vault-0 -n vault -- vault status
# Sealed:  false  ← thành công
# HA Mode: standalone
```

Pod sẽ chuyển sang `1/1 Running` sau khi unseal xong:

```bash
kubectl get pods -n vault
# vault-0   1/1   Running   0   3m
```

> **Lưu ý:** Mỗi lần server/pod restart, Vault bị sealed lại. Phải chạy lại bước unseal này.
> Xem mục **Unseal sau khi restart** ở cuối file.

---

## Bước 5: Configure Vault

### 5.1 Login

```bash
ROOT_TOKEN=$(cat vault-init.json | jq -r '.root_token')
kubectl exec vault-0 -n vault -- vault login $ROOT_TOKEN
```

### 5.2 Enable KV v2

```bash
kubectl exec vault-0 -n vault -- vault secrets enable -path=secret kv-v2
```

### 5.3 Enable Kubernetes Auth

```bash
kubectl exec vault-0 -n vault -- vault auth enable kubernetes

kubectl exec vault-0 -n vault -- vault write auth/kubernetes/config \
  kubernetes_host="https://kubernetes.default.svc.cluster.local:443"
```

### 5.4 Tạo policies

```bash
# Policy cho namespace data (DB secrets)
kubectl exec vault-0 -n vault -- /bin/sh -c '
vault policy write data-policy - <<EOF
path "secret/data/data/*" {
  capabilities = ["read"]
}
EOF'

# Policy cho namespace dev (app secrets + shared redis + elasticsearch)
kubectl exec vault-0 -n vault -- /bin/sh -c '
vault policy write dev-policy - <<EOF
path "secret/data/dev/*" {
  capabilities = ["read"]
}
path "secret/metadata/dev/*" {
  capabilities = ["read"]
}
path "secret/data/data/redis" {
  capabilities = ["read"]
}
path "secret/data/monitoring/elasticsearch" {
  capabilities = ["read"]
}
EOF'

# Policy cho namespace uat (app secrets + shared redis + elasticsearch)
kubectl exec vault-0 -n vault -- /bin/sh -c '
vault policy write uat-policy - <<EOF
path "secret/data/uat/*" {
  capabilities = ["read"]
}
path "secret/metadata/uat/*" {
  capabilities = ["read"]
}
path "secret/data/data/redis" {
  capabilities = ["read"]
}
path "secret/data/monitoring/elasticsearch" {
  capabilities = ["read"]
}
EOF'

# Policy cho shared secrets (ECR credentials)
kubectl exec vault-0 -n vault -- /bin/sh -c '
vault policy write shared-policy - <<EOF
path "secret/data/shared/*" {
  capabilities = ["read"]
}
EOF'

# Policy cho monitoring 
kubectl exec vault-0 -n vault -- /bin/sh -c '
vault policy write monitoring-policy - <<EOF
path "secret/data/monitoring/*" {
  capabilities = ["read"]
}
EOF'

```

### 5.5 Tạo Kubernetes roles

```bash
# Role cho namespace data (postgres + redis secrets)
kubectl exec vault-0 -n vault -- vault write auth/kubernetes/role/data-role \
  bound_service_account_names="default" \
  bound_service_account_namespaces="data" \
  policies="data-policy" \
  audience="vault" \
  ttl="1h"

# Role cho namespace dev (app secrets)
kubectl exec vault-0 -n vault -- vault write auth/kubernetes/role/dev-role \
  bound_service_account_names="default" \
  bound_service_account_namespaces="dev" \
  policies="dev-policy" \
  audience="vault" \
  ttl="1h"

# Role cho namespace uat (app secrets)
kubectl exec vault-0 -n vault -- vault write auth/kubernetes/role/uat-role \
  bound_service_account_names="default" \
  bound_service_account_namespaces="uat" \
  policies="uat-policy" \
  audience="vault" \
  ttl="1h"

# Role cho kube-system (ECR credentials)
kubectl exec vault-0 -n vault -- vault write auth/kubernetes/role/kube-system-role \
  bound_service_account_names="default" \
  bound_service_account_namespaces="kube-system" \
  policies="shared-policy" \
  audience="vault" \
  ttl="1h"

# Role cho monitoring
kubectl exec vault-0 -n vault -- vault write auth/kubernetes/role/monitoring-role \
  bound_service_account_names="default" \
  bound_service_account_namespaces="monitoring" \
  policies="monitoring-policy" \
  audience="vault" \
  ttl="1h"

```

---

## Bước 6: Populate secrets vào Vault

**Thay các giá trị `CHANGE_ME_*` bằng giá trị thực trước khi chạy.**

```bash
# DB secrets — dev
kubectl exec vault-0 -n vault -- vault kv put secret/data/postgres-dev \
  POSTGRES_DB="devdb" \
  POSTGRES_USER="devuser" \
  POSTGRES_PASSWORD="CHANGE_ME_DEV_PG_PASS"

kubectl exec vault-0 -n vault -- vault kv put secret/data/redis-dev \
  REDIS_PASSWORD="CHANGE_ME_DEV_REDIS_PASS"

# DB secrets — uat
kubectl exec vault-0 -n vault -- vault kv put secret/data/postgres-uat \
  POSTGRES_DB="uatdb" \
  POSTGRES_USER="uatuser" \
  POSTGRES_PASSWORD="CHANGE_ME_UAT_PG_PASS"

kubectl exec vault-0 -n vault -- vault kv put secret/data/redis-uat \
  REDIS_PASSWORD="CHANGE_ME_UAT_REDIS_PASS"

# App secrets — dev (dùng chung cho 5 apps trong namespace dev)
kubectl exec vault-0 -n vault -- vault kv put secret/dev/app \
  JWT_SECRET="CHANGE_ME_DEV_JWT" \
  API_KEY="CHANGE_ME_DEV_API_KEY"

# App secrets — uat
kubectl exec vault-0 -n vault -- vault kv put secret/uat/app \
  JWT_SECRET="CHANGE_ME_UAT_JWT" \
  API_KEY="CHANGE_ME_UAT_API_KEY"

# AWS ECR credentials
kubectl exec vault-0 -n vault -- vault kv put secret/shared/aws-ecr \
  AWS_ACCESS_KEY_ID="CHANGE_ME" \
  AWS_SECRET_ACCESS_KEY="CHANGE_ME" \
  AWS_REGION="ap-southeast-1" \
  AWS_ACCOUNT_ID="CHANGE_ME"
```
Ví dụ:

```bash
kubectl exec vault-0 -n vault -- vault kv put secret/data/redis \
  REDIS_PASSWORD=""

kubectl exec vault-0 -n vault -- vault kv put secret/monitoring/elasticsearch \
  ELASTIC_PASSWORD=""

kubectl exec vault-0 -n vault -- vault kv put secret/dev/app \
  DB_USER="" \
  JWT_SECRET="" \
  AWS_KEY="" \
  AWS_SECRETKEY="" \
  REDIS_CONNECTION=""


kubectl exec vault-0 -n vault -- vault kv put secret/uat/app \
  DB_USER="" \
  JWT_SECRET="" \
  AWS_KEY="" \
  AWS_SECRETKEY="" \
  REDIS_CONNECTION=""

kubectl exec vault-0 -n vault -- vault kv put secret/shared/aws-ecr \
  AWS_KEY="" \
  AWS_SECRETKEY=""
```

Kiểm tra đã lưu đúng:

```bash
kubectl exec vault-0 -n vault -- vault kv get secret/data/redis
kubectl exec vault-0 -n vault -- vault kv get secret/monitoring/elasticsearch
kubectl exec vault-0 -n vault -- vault kv get secret/dev/app
kubectl exec vault-0 -n vault -- vault kv get secret/uat/app
kubectl exec vault-0 -n vault -- vault kv get secret/shared/aws-ecr
```

---

## Bước 7: Install Vault Secrets Operator (VSO)

```
Vault                    VaultStaticSecret (cầu nối)         K8s Secret
─────────────────────    ───────────────────────────          ──────────────────
secret/dev/app  ──────▶  mount: secret               ──────▶ name: app-dev-secret
  DB_USER=admin          path: dev/app                        DB_USER=admin
  DB_PASSWORD=xxx        destination.name: app-dev-secret     DB_PASSWORD=xxx
```

```bash
helm install vault-secrets-operator hashicorp/vault-secrets-operator \
  --namespace vault \
  --set defaultVaultConnection.enabled=true \
  --set defaultVaultConnection.address="http://vault.vault.svc.cluster.local:8200"


kubectl get pods -n vault
# vault-0                                          1/1   Running   0
# vault-secrets-operator-controller-manager-xxx    1/1   Running   0
```

---

## Bước 8: Apply VaultAuth + VaultStaticSecret CRDs

VSO cần `VaultAuth` (cách authenticate) và `VaultStaticSecret` (secret cần sync) trong từng namespace.

# VaultAuth: Cấu hình auth method (Kubernetes Auth) cho từng namespace

```bash
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultAuth
metadata:
  name: dev-auth
  namespace: dev
spec:
  method: kubernetes
  mount: kubernetes
  kubernetes:
    role: dev-role          # role đã config trong Vault
    serviceAccount: default
    audiences:
      - vault
```
# VaultStaticSecret: Định nghĩa secret nào trong Vault sẽ sync về namespace nào dưới dạng k8s Secret

```bash
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultStaticSecret
metadata:
  name: app-dev-secret
  namespace: dev
spec:
  vaultAuthRef: dev-auth    # trỏ tới VaultAuth ở trên
  type: kv-v2
  mount: secret             # KV mount trong Vault
  path: dev/app             # path của secret
  destination:
    name: app-dev-secret    # tên K8s Secret sẽ được tạo
    create: true
  refreshAfter: 60s         # VSO tự re-sync mỗi 60s

```
### Apply

```bash
# VaultAuth cho từng namespace
kubectl apply -f configs/vault/vault-auth-data.yaml
kubectl apply -f configs/vault/vault-auth-dev.yaml
kubectl apply -f configs/vault/vault-auth-uat.yaml
kubectl apply -f configs/vault/vault-auth-kube-system.yaml
kubectl apply -f configs/vault/vault-auth-monitoring.yaml

# VaultStaticSecret — sync từ Vault → k8s Secrets
kubectl apply -f configs/vault/vault-static-secrets-data.yaml
kubectl apply -f configs/vault/vault-static-secrets-dev.yaml
kubectl apply -f configs/vault/vault-static-secrets-uat.yaml
kubectl apply -f configs/vault/vault-static-secret-ecr.yaml
kubectl apply -f configs/vault/vault-static-secret-elasticsearch.yaml
```

### Xóa

```bash
# Xóa VaultStaticSecret + VaultAuth (CRDs)
kubectl delete -f configs/vault/vault-static-secrets-data.yaml
kubectl delete -f configs/vault/vault-static-secrets-dev.yaml
kubectl delete -f configs/vault/vault-static-secrets-uat.yaml
kubectl delete -f configs/vault/vault-static-secret-ecr.yaml
kubectl delete -f configs/vault/vault-static-secret-elasticsearch.yaml
kubectl delete -f configs/vault/vault-auth-data.yaml
kubectl delete -f configs/vault/vault-auth-dev.yaml
kubectl delete -f configs/vault/vault-auth-uat.yaml
kubectl delete -f configs/vault/vault-auth-kube-system.yaml
kubectl delete -f configs/vault/vault-auth-monitoring.yaml

# Xóa k8s Secrets do VSO sinh ra
kubectl delete secret redis-secret -n data
kubectl delete secret app-dev-secret -n dev
kubectl delete secret app-uat-secret -n uat
kubectl delete secret aws-ecr-credentials -n kube-system
kubectl delete secret elasticsearch-secret -n monitoring
```

### Kiểm tra VSO đã sync

```bash
# VaultStaticSecret status
kubectl get vaultstaticsecret -n data
kubectl get vaultstaticsecret -n dev
kubectl get vaultstaticsecret -n uat
kubectl get vaultstaticsecret -n monitoring
kubectl get vaultstaticsecret -n kube-system


# k8s Secrets đã được tạo chưa
kubectl get secret redis-password -n data
kubectl get secret app-dev-secret -n dev
kubectl get secret app-uat-secret -n uat
kubectl get secret aws-ecr-credentials -n kube-system
kubectl get secret elasticsearch-password -n monitoring
```

---

## Bước 9: Vault UI Ingress (VPN-only)
**Nhớ thay đổi `vault.company.com` trong file `vault-ingress.yaml` thành domain thực tế của bạn trước khi apply.**

```bash
kubectl apply -f configs/vault/vault-vpn-middleware.yaml
kubectl apply -f configs/vault/vault-ingress.yaml
```

Truy cập: `https://vault.company.com` (phải bật VPN trước)

Đăng nhập bằng root token từ `vault-init.json`.

> **Sau khi vào Vault UI**: Tạo một admin token mới (Policies → Token → Generate), lưu root token offline. Không dùng root token hàng ngày.

---

## Bước 10: Quản lý Vault qua ArgoCD (Optional)

Để ArgoCD manage Vault và VSO thay vì Helm manual:

```bash
kubectl apply -f configs/vault/argocd-vault-app.yaml
kubectl apply -f configs/vault/argocd-vso-app.yaml
```

> **Lưu ý:** ArgoCD chỉ quản lý việc deploy Helm chart (upgrade, values).
> Việc init/unseal/populate secrets vẫn phải làm thủ công vì đây là dữ liệu nhạy cảm.

---

## Verify

```bash
# Vault status
kubectl exec vault-0 -n vault -- vault status

# VSO pods healthy
kubectl get pods -n vault

# VaultStaticSecret synced
kubectl get vaultstaticsecret -A
# NAMESPACE   NAME                  READY   STATUS
# data        postgres-dev-secret   True    Synced
# data        postgres-uat-secret   True    Synced
# data        redis-dev-secret      True    Synced
# data        redis-uat-secret      True    Synced
# dev         app-dev-secret        True    Synced
# uat         app-uat-secret        True    Synced
# kube-system aws-ecr-credentials   True    Synced

# k8s Secrets đã có data
kubectl get secret postgres-dev-secret -n data -o jsonpath='{.data}' | base64 -d 2>/dev/null || \
  kubectl get secret postgres-dev-secret -n data -o yaml | grep -A5 data:

kubectl get secret aws-ecr-credentials -n kube-system \
  -o jsonpath='{.data.AWS_KEY}' | base64 -d

```

---

## Unseal sau khi restart

Mỗi lần Vault pod restart (server reboot, pod crash, etc.), Vault bị sealed lại và cần unseal thủ công:

```bash
# Kiểm tra Vault có bị sealed không
kubectl exec vault-0 -n vault -- vault status | grep Sealed

# Nếu Sealed: true → unseal
UNSEAL_KEY_1="<key-1-từ-vault-init.json>"
UNSEAL_KEY_2="<key-2-từ-vault-init.json>"
UNSEAL_KEY_3="<key-3-từ-vault-init.json>"

kubectl exec vault-0 -n vault -- vault operator unseal $UNSEAL_KEY_1
kubectl exec vault-0 -n vault -- vault operator unseal $UNSEAL_KEY_2
kubectl exec vault-0 -n vault -- vault operator unseal $UNSEAL_KEY_3
```

Sau khi unseal, VSO sẽ tự động resume sync secrets (không cần làm gì thêm).

---

## Thêm secret mới vào Vault

Workflow khi cần thêm env var mới cho app:

```bash
# 1. Thêm vào Vault
kubectl exec vault-0 -n vault -- vault kv patch secret/dev/app \
  NEW_ENV_VAR="value"

# 2. VSO tự động sync trong vòng refreshAfter (60s)
# Không cần kubectl apply gì thêm

# 3. Pod cần restart để nhận env mới
kubectl rollout restart deployment/<app-name> -n dev
```

---

## Cập nhật giá trị secret

```bash
# Update secret trong Vault
kubectl exec vault-0 -n vault -- vault kv put secret/dev/app \
  JWT_SECRET="new-jwt-secret" \
  API_KEY="existing-api-key"

# VSO tự sync, pod restart để nhận giá trị mới
kubectl rollout restart deployment/<app-name> -n dev
```
