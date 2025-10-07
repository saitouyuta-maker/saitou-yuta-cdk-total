# ベースイメージ
FROM public.ecr.aws/docker/library/python:3.10-slim

# Nginx と curl をインストール
RUN apt-get update && apt-get install -y \
    nginx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python requests のインストール
RUN pip install --no-cache-dir requests

# Nginx 設定ファイル（デフォルトで起動）
RUN echo "server { \
    listen 80; \
    location /health { return 200 'OK'; } \
    location /test { \
        default_type application/json; \
        return 200 '{\"status\":\"running\"}'; \
    } \
}" > /etc/nginx/sites-available/default

# Nginx をフォアグラウンドで起動
# Python スクリプトで外部APIを叩く場合は & でバックグラウンド実行
CMD ["sh", "-c", "python3 -u -c \"import requests,time; print('Start JSONPlaceholder test'); r=requests.get('https://jsonplaceholder.typicode.com/todos/1'); print(r.json()); time.sleep(3600)\" & nginx -g 'daemon off;'"]
