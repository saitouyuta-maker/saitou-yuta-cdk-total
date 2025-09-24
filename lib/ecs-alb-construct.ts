import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface EcsAlbConstructProps {
  vpc: ec2.IVpc;
  ecsSecurityGroup: ec2.ISecurityGroup;
  albSecurityGroup: ec2.ISecurityGroup;
  dbName: string; 
  dbSecret: secretsmanager.ISecret;
  dbHost: string;
}

export class EcsAlbConstruct extends Construct {
  public readonly cluster: ecs.Cluster;
  public readonly fargateService: ecs.FargateService;
  public readonly alb: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: EcsAlbConstructProps) {
    super(scope, id);

    //ecrを参照
    const repo = ecr.Repository.fromRepositoryName(this, 'MyRepo', 'saitou-yuta-yuta-cicd');
    // 既存のタスクロール
    const taskRole = iam.Role.fromRoleName(this, 'TaskRole', 'saitou-yuta-ecs-taskroles');

    // 既存のタスク実行ロール
    const executionRole = iam.Role.fromRoleName(this, 'ExecutionRole', 'ecsTaskExecutionRole');

//【リソース構築】

    // ECSクラスター作成
    this.cluster = new ecs.Cluster(this, 'MyEcsCluster', {
      vpc: props.vpc,
      clusterName: 'saitou-yuta-cdk-ecs-cluster',
    });
    cdk.Tags.of(this.cluster).add('Owner', 'saitou-yuta');
    // Fargate タスク定義
    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole,
      executionRole,
      family: 'saitou-yuta-cdk-taskdef',
    });
    cdk.Tags.of(taskDef).add('Owner', 'saitou-yuta');


    // コンテナ追加
    const container = taskDef.addContainer('AppContainer', {
      containerName: 'saitou-yuta-cdk-container',
      image: ecs.ContainerImage.fromEcrRepository(repo),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'saitou-yuta-cdk-apache' }),
    });
    container.addPortMappings({
      containerPort: 80,
    });
    if (!props.dbSecret) {
      throw new Error('dbSecret is undefined');
    }

    container.addSecret('DB_USER', ecs.Secret.fromSecretsManager(props.dbSecret, 'username'));
    container.addSecret('DB_PASSWORD', ecs.Secret.fromSecretsManager(props.dbSecret, 'password'));
    container.addEnvironment('DB_HOST', props.dbHost); 
    container.addEnvironment('DB_NAME', props.dbName);

    cdk.Tags.of(container).add('Owner', 'saitou-yuta');

    // ALB 作成（パブリック）
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'MyAlb', {
      vpc: props.vpc,
      internetFacing: true,
      loadBalancerName: 'saitou-yuta-cdk-alb',
      securityGroup: props.albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });
    cdk.Tags.of(this.alb).add('Owner', 'saitou-yuta');

    // ACM 証明書（既存のARNを指定）
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'MyCert',
      'arn:aws:acm:ap-northeast-1:133285731447:certificate/076bd2e7-66c0-4e97-a0ef-3abfbb448cae'
    );

    // リスナー（HTTPS）
    const httpsListener = this.alb.addListener('HttpsListener', {
      port: 443,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404), // デフォルトは404
    });

    // ターゲットグループ作成（ECS用）
    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'EcsTargetGroup', {
      targetGroupName: 'saitou-yuta-cdk-tg',
      vpc: props.vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: '/index.html',
        healthyHttpCodes: '200',
      },
    });
    cdk.Tags.of(targetGroup).add('Owner', 'saitou-yuta');

    // ECS サービス作成（Fargate）
    this.fargateService = new ecs.FargateService(this, 'FargateService', {
      cluster: this.cluster,
      serviceName: 'saitou-yuta-cdk-ecsservice',
      taskDefinition: taskDef,
      desiredCount: 2, // AZ 跨ぎで冗長化
      assignPublicIp: false,
      vpcSubnets: { subnetGroupName: 'EcsPrivateSubnet' },
      securityGroups: [props.ecsSecurityGroup],
      enableExecuteCommand: true,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,  
    });
    cdk.Tags.of(this.fargateService).add('Owner', 'saitou-yuta');

    // ALB → ECS タスク通信許可
    this.fargateService.connections.allowFrom(this.alb, ec2.Port.tcp(80));

    // リスナーにターゲットグループを追加
    httpsListener.addTargetGroups('EcsTG', {
      targetGroups: [targetGroup],
    });

    // ECS サービスをターゲットに登録
    this.fargateService.attachToApplicationTargetGroup(targetGroup);
  }
}

