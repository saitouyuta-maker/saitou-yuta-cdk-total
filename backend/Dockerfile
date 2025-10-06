FROM public.ecr.aws/docker/library/python:3.10-slim
RUN pip install requests
CMD ["python3", "-c", "import requests; print('Start test...'); print(requests.get(\"https://api.ipify.org\").text)"]

