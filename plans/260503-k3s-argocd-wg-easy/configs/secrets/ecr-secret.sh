#!/bin/bash
# Tạo ecr-secret cho các namespace

# Cài AWS CLI nếu chưa có
if ! command -v aws &>/dev/null; then
  echo "Installing AWS CLI..."
  sudo apt-get install -y unzip 2>/dev/null || sudo yum install -y unzip 2>/dev/null
  curl -s "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
  echo "AWS CLI installed: $(aws --version)"
fi

AWS_ACCESS_KEY_ID="YOUR_KEY"
AWS_SECRET_ACCESS_KEY="YOUR_SECRET"
ECR_REGISTRY="370404697988.dkr.ecr.ap-southeast-1.amazonaws.com"
SECRET_NAME="dockerhub-secret"
NAMESPACES=("dev" "uat" "public")

ECR_TOKEN=$(AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  aws ecr get-login-password --region ap-southeast-1)

for NS in "${NAMESPACES[@]}"; do
  kubectl create secret docker-registry "$SECRET_NAME" \
    --namespace "$NS" \
    --docker-server="$ECR_REGISTRY" \
    --docker-username=AWS \
    --docker-password="$ECR_TOKEN" \
    --dry-run=client -o yaml | kubectl apply -f -

  echo "Created $SECRET_NAME in namespace: $NS"
done