#!/bin/bash
# Tạo kubeconfig cho dev
# Usage: ./create-kubeconfig.sh <dev-name> [vpn-server-ip]
# Example: ./create-kubeconfig.sh nguyen-van-a 10.8.0.1

set -e

DEV_NAME="${1:?Usage: $0 <dev-name> [vpn-server-ip]}"
VPN_SERVER_IP="${2:-10.8.0.1}"
OUTPUT_FILE="${DEV_NAME}-kubeconfig.yaml"

echo "Generating token for $DEV_NAME (1 year)..."
TOKEN=$(kubectl create token "$DEV_NAME" -n dev --duration=8760h)

cat > "$OUTPUT_FILE" <<EOF
apiVersion: v1
kind: Config
clusters:
- name: k3s-cluster
  cluster:
    server: https://${VPN_SERVER_IP}:6443
    insecure-skip-tls-verify: true
contexts:
- name: k3s-cluster
  context:
    cluster: k3s-cluster
    user: ${DEV_NAME}
    namespace: dev
current-context: k3s-cluster
users:
- name: ${DEV_NAME}
  user:
    token: ${TOKEN}
EOF

echo "Kubeconfig saved: $OUTPUT_FILE"
echo "Send this file to $DEV_NAME"
