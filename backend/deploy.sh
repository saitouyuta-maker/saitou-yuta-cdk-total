#!/bin/bash

set -e

usage() { echo "Usage: $0 [-n <num_of_tasks>] [--nginx] [--app] [--prod] [--staging] [--push-image-only] [--skip-tests]" 1>&2; exit 1; }

APP_IMAGE_TAG="saitou-yuta-app"
NGINX_IMAGE_TAG="saitou-yuta-nginx"

num_of_tasks=2
include_nginx=false
include_app=false
is_prod=false
is_stagin=false
push_image_only=false
skip_tests=false

optspec=":n:-:-:-:-:-:"
while getopts "$optspec" o; do
    case "${o}" in
        -)
            case "${OPTARG}" in
                nginx)
                    include_nginx=true
                    ;;
                app)
                    include_app=true
                    ;;
                prod)
                    is_prod=true
                    ;;
                staging)
                    is_staging=true
                    ;;
                push-image-only)
                    push_image_only=true
                    ;;
                skip-tests)
                    skip_tests_=true
                    ;;
                *)
                    usage
                    ;;
            esac;;
        n)
            num_of_tasks=${OPTARG}
            [[ $num_of_tasks =~ ^[0-9]+$ ]] || usage
            ;;
        *)
            usage
            ;;
    esac
done

if ${is_staging}; then
    is_prod=false
fi

if ${is_prod}; then
    ECS_REGION="ap-northeast-1"
    ECS_CLUSTER_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_SERVICE_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_APP_REPO_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_NGINX_REPO_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECR_URI="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
elif ${is_staging}; then
    ECS_REGION="ap-northeast-1"
    ECS_CLUSTER_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_SERVICE_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_APP_REPO_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_NGINX_REPO_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECR_URI="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
else 
    ECS_REGION="ap-northeast-1"
    ECS_CLUSTER_NAME="saitou-yuta-cdk-dev-ClusterEB0386A7-2P07peoiVQlR"
    ECS_SERVICE_NAME="saitou-yuta-cdk-dev-AppServiceA2F9036C-1JDfUIRXa0Bu"
    ECS_APP_REPO_NAME="saitou-yuta-cdk-dev-appecrrepo838814f9-i3az931tiiob"
    ECS_NGINX_REPO_NAME="saitou-yuta-cdk-dev-nginxecrrepoe287fda7-gvcbm8ekoovg"
    ECR_URI="133285731447.dkr.ecr.ap-northeast-1.amazonaws.com"
fi

echo "Started the deployment of ${ECS_SERVICE_NAME}..."


echo "Logging in to ECR..."
aws ecr get-login-password --region "${ECS_REGION}" --profile saitou-yuta-profile | docker login --username AWS --password-stdin "${ECR_URI}"

## Build and push APP image if specified
if ${include_app}; then 
    ### Build APP image
    echo "Building APP docker image..."
    docker build -t "${APP_IMAGE_TAG}" .
    docker tag "${APP_IMAGE_TAG}" "${ECR_URI}/${ECS_APP_REPO_NAM}"
    #Push image to ECR
    echo "Pushing APP image to ECR..."
    docker push "${ECR_URI}/${ECS_APP_REPO_NAME}"
fi

## Build and push Nginx image if specified
if ${include_nginx}; 
    ### Build Nginx image
    echo "Building Nginx docker image..."
    docker build -t "${NGINX_IMAGE_TAG}" .
    docker tag "${NGINX_IMAGE_TAG}" "${ECR_URI}/${ECS_NGINX_REPO_NAM}"
    #Push image to ECR
    echo "Pushing Nginx image to ECR..."
    docker push "${ECR_URI}/${ECS_NGINX_REPO_NAME}"
    cd ..
fi

spinner()
{
    local pid=$!
    local delay=0.3
    local spinstr='|/-\'
    while [ "$(ps a | awk '{print $1}' | grep $pid)" ]; do
        local temp=${spinstr#?}
        printf "\b%c" "$spinstr"
        local spinstr=$temp${spinstr%"$temp"}
        sleep $delay
    done
    printf "\b"
}

if ${push_image_only}; then
    echo "Pushed image to ECR successfully!"
else
    #ECS operations
    echo "Updating ECS service..."
    aws ecs update-service --region "${ECS_REGION}" --cluster "${ECS_CLUSTER_NAME}" --service "${ECS_SERVICE_NAME}" --desired-cont "${num_of_tasks}" --force-new-deployment --profile saitou-yuta-profile > /dev/null
    echo "Wating for ECS service to be stable..."
    aws ecs wait services-stable --region "${ECS_REGION}" --cluster "${ECS_CLUSTER_NAME}" --service "${ECS_SERVICE_NAME}" --profile saitou-yuta-profile & spinner

    echo "Deployed successfully!"
fi
