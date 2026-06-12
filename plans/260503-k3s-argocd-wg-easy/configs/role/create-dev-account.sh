#!/bin/bash
# Tạo ServiceAccount + RoleBinding cho dev
# Usage: ./create-dev-account.sh <dev-name>
# Example: ./create-dev-account.sh nguyen-van-a

set -e

DEV_NAME="${1:?Usage: $0 <dev-name>}"

echo "Creating ServiceAccount: $DEV_NAME"
kubectl create serviceaccount "$DEV_NAME" -n dev

echo "Binding dev-role (namespace dev)..."
kubectl create rolebinding "${DEV_NAME}-dev-binding" \
  --role=dev-role \
  --serviceaccount="dev:$DEV_NAME" \
  -n dev

echo "Binding uat-readonly-role (namespace uat)..."
kubectl create rolebinding "${DEV_NAME}-uat-binding" \
  --role=uat-readonly-role \
  --serviceaccount="dev:$DEV_NAME" \
  -n uat

echo "Binding data-portforward-role (namespace data)..."
kubectl create rolebinding "${DEV_NAME}-data-binding" \
  --role=data-portforward-role \
  --serviceaccount="dev:$DEV_NAME" \
  -n data

echo "Binding stg-role (namespace stg)..."
kubectl create rolebinding "${DEV_NAME}-stg-binding" \
  --role=stg-role \
  --serviceaccount="dev:$DEV_NAME" \
  -n stg

echo "Done. Run ./create-kubeconfig.sh $DEV_NAME to generate kubeconfig."
