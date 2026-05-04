# Phase 04 — cert-manager + SSL

## Bước 1: Cài cert-manager qua ArgoCD (sau khi ArgoCD đã chạy)

```bash
kubectl apply -f configs/helm/cert-manager-app.yaml
```

ArgoCD sẽ tự pull Helm chart và deploy cert-manager vào namespace `cert-manager`.

Kiểm tra pods:

```bash
kubectl get pods -n cert-manager
# cert-manager-xxx            Running
# cert-manager-cainjector-xxx Running
# cert-manager-webhook-xxx    Running
```

> **Lưu ý thứ tự:** cert-manager phải cài **sau** khi ArgoCD đã chạy (phase 05).
> Nếu cần cài cert-manager trước ArgoCD (ví dụ để cấp SSL cho ArgoCD), dùng Helm trực tiếp:
> ```bash
> helm repo add jetstack https://charts.jetstack.io && helm repo update
> helm install cert-manager jetstack/cert-manager \
>   --namespace cert-manager --set crds.enabled=true
> ```

## Bước 2: Tạo ClusterIssuer staging

```bash
kubectl apply -f configs/cert-manager/cluster-issuer-staging.yaml
kubectl get clusterissuer
# letsencrypt-staging   True
```

## Bước 3: Test với một domain public

Tạo file test-cert.yaml để kiểm tra flow hoạt động:

```yaml
# test-cert.yaml (xoá sau khi test xong)
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: test-cert
  namespace: default
spec:
  secretName: test-cert-tls
  issuerRef:
    name: letsencrypt-staging
    kind: ClusterIssuer
  dnsNames:
    - app.company.com
```

```bash
kubectl apply -f test-cert.yaml

# Theo dõi quá trình cấp cert
kubectl describe certificate test-cert
kubectl get certificaterequest
kubectl get order -A
kubectl get challenge -A
```

Cert staging thành công khi:
```
Status: True
Reason: Ready
```

Dọn dẹp sau test:
```bash
kubectl delete -f test-cert.yaml
```

## Bước 4: Tạo ClusterIssuer production

Sau khi staging test OK, tạo production issuer:

```bash
kubectl apply -f configs/cert-manager/cluster-issuer-prod.yaml
kubectl get clusterissuer
# letsencrypt-prod   True
```

## Lưu ý về rate limit Let's Encrypt

```
Let's Encrypt production limit:
- 50 certificates per registered domain per week
- 5 duplicate certificates per week

Staging không có rate limit → luôn test staging trước.
```

## Verify

```bash
kubectl get clusterissuer
# NAME                   READY
# letsencrypt-staging    True
# letsencrypt-prod       True
```
