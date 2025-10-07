ARG REPO=public.ecr.aws/nginx

FROM --platform=linux/amd64 ${REPO}/nginx:stable-alpine
COPY default.conf /etc/nginx/conf.d

#Create directories for unix socket and static files
RUN mkdir -p /var/run/gunicorn
RUN mkdir -p /var/www/app/static
EXPOSE 80

CMD nginx -g 'daemon off;'