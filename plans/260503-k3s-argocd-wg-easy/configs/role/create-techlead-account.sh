#!/bin/bash
# Tạo ServiceAccount + RoleBinding cho tech lead
# SA đặt ở namespace dev để tái dùng được create-kubeconfig.sh
# Usage: ./create-techlead-account.sh <techlead-name>
# Example: ./create-techlead-account.sh tran-van-b

set -e

TL_NAME="${1:?Usage: $0 <techlead-name>}"

echo "Creating ServiceAccount: $TL_NAME"
kubectl create serviceaccount "$TL_NAME" -n dev

echo "Binding techlead-role (namespace dev)..."
kubectl create rolebinding "${TL_NAME}-dev-binding" \
  --role=techlead-role \
  --serviceaccount="dev:$TL_NAME" \
  -n dev

echo "Binding techlead-role (namespace stg)..."
kubectl create rolebinding "${TL_NAME}-stg-binding" \
  --role=techlead-role \
  --serviceaccount="dev:$TL_NAME" \
  -n stg

echo "Binding techlead-role (namespace uat)..."
kubectl create rolebinding "${TL_NAME}-uat-binding" \
  --role=techlead-role \
  --serviceaccount="dev:$TL_NAME" \
  -n uat

echo "Binding data-portforward-role (namespace data)..."
kubectl create rolebinding "${TL_NAME}-data-binding" \
  --role=data-portforward-role \
  --serviceaccount="dev:$TL_NAME" \
  -n data

echo "Done. Run ./create-kubeconfig.sh $TL_NAME to generate kubeconfig."
