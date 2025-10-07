# ベースイメージ
FROM public.ecr.aws/docker/library/python:3.10-slim

# Nginx と curl をインストール
RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python requests のインストール
RUN pip install --no-cache-dir requests

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

# Python スクリプト作成 (外部 API を定期実行)
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

# Nginx 用ポートを公開
EXPOSE 80

# Python スクリプトをバックグラウンドで起動しつつ Nginx をフォアグラウンドで起動
CMD ["sh", "-c", "python3 /app/api_worker.py & nginx -g 'daemon off;'"]
