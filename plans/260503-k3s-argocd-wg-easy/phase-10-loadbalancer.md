# Phase 10 — Expose Service trực tiếp qua LoadBalancer (không qua Ingress)

> Dùng k3s ServiceLB (klipper-lb) để bind port 8080 trên node thẳng vào pod.
> Không đi qua Traefik Ingress.

---

## Khi nào dùng

- Service cần protocol không phải HTTP/HTTPS (gRPC, TCP, WebSocket raw, v.v.)
- Muốn tránh overhead của Ingress controller
- Cần port cố định từ internet vào một service cụ thể

---

## [SERVER/GITOPS] Bước 1: Mở port trên UFW

```bash
sudo ufw allow 8080/tcp comment "LoadBalancer myapp"
sudo ufw status verbose
```

---

## [GITOPS] Bước 2: Tạo Deployment + Service manifest

Tạo file `gitops-repo/apps/myapp/loadbalancer.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: dev
spec:
  replicas: 1
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
      - name: myapp
        image: YOUR_DOCKERHUB_USERNAME/myapp:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 256Mi
---
apiVersion: v1
kind: Service
metadata:
  name: myapp-lb
  namespace: dev
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
  - name: http
    port: 8080
    targetPort: 8080
    protocol: TCP
```

> k3s ServiceLB tự động tạo DaemonSet bind port 8080 trên node.
> `EXTERNAL-IP` sẽ là IP public của node sau vài giây.

---

## [GITOPS] Bước 3: Tạo ArgoCD Application

Tạo file `configs/argocd/argocd-app-myapp-lb.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp-lb
  namespace: argocd
spec:
  project: default
  source:
    repoURL: YOUR_GITHUB_REPO
    targetRevision: HEAD
    path: apps/myapp
  destination:
    server: https://kubernetes.default.svc
    namespace: dev
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Apply lên cluster:

```bash
kubectl apply -f configs/argocd/argocd-app-myapp-lb.yaml
```

---

## [LOCAL] Bước 4: Kiểm tra

```bash
# Xem EXTERNAL-IP đã được gán chưa
kubectl get svc myapp-lb -n dev

# Kết quả mong đợi:
# NAME        TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)          AGE
# myapp-lb    LoadBalancer   10.43.x.x      SERVER_PUBLIC_IP 8080:xxxxx/TCP   1m

# Test từ máy local
curl http://SERVER_PUBLIC_IP:8080

# Xem ServiceLB DaemonSet do k3s tạo
kubectl get daemonset -n kube-system | grep svclb
```

---

## Lưu ý

| Vấn đề | Giải pháp |
|---|---|
| `EXTERNAL-IP` bị `<pending>` mãi | Kiểm tra `kubectl get pods -n kube-system \| grep svclb` — pod svclb phải Running |
| Port conflict với service khác | Kiểm tra `sudo ss -tlnp \| grep 8080` trên node |
| Muốn nhiều port | Thêm nhiều entry trong `ports[]` của Service |
| Muốn dùng domain thay IP | Trỏ DNS A record về `SERVER_PUBLIC_IP`, truy cập `http://yourdomain.com:8080` |

---

## So sánh với Ingress

| | LoadBalancer (phase này) | Ingress (Traefik) |
|---|---|---|
| Protocol | TCP/UDP bất kỳ | HTTP/HTTPS |
| SSL | Tự xử lý trong app hoặc thêm cert | cert-manager lo |
| Port | Cố định (8080) | 80/443 + path routing |
| Phù hợp | gRPC, TCP service, port đặc biệt | Web app thông thường |
