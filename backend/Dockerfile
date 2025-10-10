# ベースイメージ
FROM public.ecr.aws/docker/library/python:3.10-slim

# 必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python パッケージインストール
RUN pip install --no-cache-dir requests boto3

# 作業ディレクトリ作成
RUN mkdir -p /app
WORKDIR /app

# Nginx 設定ファイル
RUN cat <<EOF > /etc/nginx/sites-available/default
server {
    listen 80;

    location /health {
        return 200 "OK";
    }

    location /test {
        default_type application/json;
        return 200 '{"status":"running"}';
    }
}
EOF

# API Worker スクリプト
RUN cat <<'PYEOF' > /app/api_worker.py
import requests
import time

def main():
    while True:
        try:
            print("Start JSONPlaceholder test")
            r = requests.get('https://jsonplaceholder.typicode.com/todos/1')
            print(r.json())
        except Exception as e:
            print(f"Error: {e}")
        time.sleep(60)  # 60秒ごとに実行

if __name__ == "__main__":
    main()
PYEOF

# ECSアクセス確認用スクリプト (S3, SQS, CloudWatch)
RUN cat <<'PYEOF' > /app/health_check.py
import boto3
import time
import os

s3 = boto3.client('s3')
sqs = boto3.client('sqs')
logs = boto3.client('logs')

BUCKET_NAME = os.environ.get('FRONTEND_BUCKET', '')
QUEUE_URL = os.environ.get('SQS_QUEUE_URL', '')
LOG_GROUP = os.environ.get('CLOUDWATCH_LOG_GROUP', '/ecs/test')

def check_s3():
    try:
        resp = s3.list_objects_v2(Bucket=BUCKET_NAME, MaxKeys=1)
        print("S3 OK:", resp.get('KeyCount', 0))
    except Exception as e:
        print("S3 Error:", e)

def check_sqs():
    try:
        resp = sqs.get_queue_attributes(QueueUrl=QUEUE_URL, AttributeNames=['ApproximateNumberOfMessages'])
        print("SQS OK:", resp.get('Attributes', {}))
    except Exception as e:
        print("SQS Error:", e)

def check_logs():
    try:
        resp = logs.describe_log_groups(logGroupNamePrefix=LOG_GROUP)
        print("CloudWatch Logs OK:", [lg['logGroupName'] for lg in resp.get('logGroups', [])])
    except Exception as e:
        print("CloudWatch Logs Error:", e)

def main():
    while True:
        check_s3()
        check_sqs()
        check_logs()
        time.sleep(60)

if __name__ == "__main__":
    main()
PYEOF

# ポート公開
EXPOSE 80

# 環境変数 (ECS タスク定義で渡す)
ENV FRONTEND_BUCKET=""
ENV SQS_QUEUE_URL=""
ENV CLOUDWATCH_LOG_GROUP=""

# Nginx をフォアグラウンド、Python スクリプトをバックグラウンドで起動
CMD ["sh", "-c", "python3 /app/api_worker.py & python3 /app/health_check.py & nginx -g 'daemon off;'"]
