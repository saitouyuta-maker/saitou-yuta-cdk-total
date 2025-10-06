cat <<'EOF' > Dockerfile
FROM public.ecr.aws/docker/library/python:3.10-slim
RUN pip install requests
CMD ["python3", "-c", "import requests; print('Start test...'); print(requests.get(\"https://api.ipify.org\").text)"]
EOF

aws ecr create-repository --repository-name test-api-connection
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-northeast-1
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
docker build -t test-api-connection .
docker tag test-api-connection:latest $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/test-api-connection:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/test-api-connection:latest
