FROM public.ecr.aws/docker/library/python:3.10-slim

# Nginx と curl をインストール
RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python requests のインストール
RUN pip install --no-cache-dir requests

# Nginx 設定
RUN echo 'server {
    listen 80;
    location /health { return 200 "OK"; }
    location /test { default_type application/json; return 200 "{\"status\":\"running\"}"; }
}' > /etc/nginx/sites-available/default

# Python スクリプトをファイル化（ループで定期実行）
RUN echo 'import requests, time
while True:
    try:
        print("Start JSONPlaceholder test")
        r = requests.get("https://jsonplaceholder.typicode.com/todos/1")
        print(r.json())
    except Exception as e:
        print("Error:", e)
    time.sleep(60)  # 60秒ごとに実行
' > /app/test_loop.py

# CMD: Python をバックグラウンドでループ実行 & nginx フォアグラウンド
CMD ["sh", "-c", "python3 -u /app/test_loop.py & nginx -g 'daemon off;'"]
