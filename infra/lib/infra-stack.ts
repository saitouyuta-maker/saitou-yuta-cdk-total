import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { Construct } from "constructs";
import InfraProps from "../common/props/infra-props";
import { Application } from "aws-cdk-lib/aws-appconfig";
import { CfnCACertificate } from "aws-cdk-lib/aws-iot";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";


export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InfraProps) {
    super(scope, id, props);

  
    ///////////////////
    // VPC
    ///////////////////
    const vpc = new ec2.Vpc(this, props.vpc.vpc.constructId, {
      //vpcName: props.vpc.vpc.name,
      ipAddresses:ec2.IpAddresses.cidr(props.vpc.vpc.cidr),
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 27,
        },
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 27,
        },
        {
          name: "isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 27,
        },
      ],
      natGateways: props.mode == "prod" ? 2 : 1,
    });

    const publicSg = new ec2.SecurityGroup(
      this,
      props.vpc.securityGroup.public.constructId,
      {
        vpc: vpc,
        allowAllOutbound: true,
        //securityGroupName: props,vpc.securityGroup.public.name,
        description: "Security group for public resources"
      }
    );

    publicSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "allow HTTP traffic from anywhere"
    );
    publicSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "allow HTTP traffic from anywhere"
    );

    const privateSg = new ec2.SecurityGroup(
      this,
      props.vpc.securityGroup.private.constructId,
      {
        vpc: vpc,
        allowAllOutbound: true,
        //securityGroupName: props,vpc.securityGroup.private.name,
        description: "Security group for private resources (ecs tasks)"
      }
    );

    privateSg.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [publicSg]
      }),
      ec2.Port.tcp(80),
      "allow traffic on port 80 from public security group"
    );

    const bastionSg = new ec2.SecurityGroup(
      this,
      props.vpc.securityGroup.bastion.constructId,
      {
        vpc: vpc,
        allowAllOutbound: true,
        //securityGroupName: props,vpc.securityGroup.isolated.name,
        description: "Security group for bastion host (SSH tunnel)"
      }
    );
    const engineerIps = 
      props.vpc.securityGroup.bastion.peerIpAddresses.split(",");
    engineerIps.forEach((cidr) => {
      bastionSg.addIngressRule(
        ec2.Peer.ipv4(cidr),
        ec2.Port.tcp(22),
        "allow SSH traffic from engineers"
      )
    });

    const isolatedSg = new ec2.SecurityGroup(
      this,
      props.vpc.securityGroup.isolated.constructId,
      {
        vpc: vpc,
        allowAllOutbound: true,
        //securityGroupName: props,vpc.securityGroup.isolated.name,
        description: "Security group for isolated resources(db)"
      }
    );
    isolatedSg.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [privateSg, bastionSg],
      }),
      ec2.Port.tcp(3306),
      "allow traffic on port 3306 from private/bastion security group"
    );

    //Redis用セキュリティグループ(isolatedSgを拡張)
    isolatedSg.connections.allowFrom(
      new ec2.Connections({
        securityGroups: [privateSg],
      }),
      ec2.Port.tcp(6379),
      "allow traffic on port 6379 (Redis) from private security group"
    );
    ///////////////////
    // Secrets Manger
    ///////////////////
    
    const dbSecret = new secretsmanager.Secret(
      this,
      props.secretsManager.dbSecret.constructId,
      {
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            username: props.secretsManager.dbSecret.username,
            dbName: props.secretsManager.dbSecret.dbName,
          }),
          generateStringKey: "password",
          passwordLength: 40,
          excludeCharacters: "/@'`\"",
        },
        description: `Database secret (${props.mode})`,
      }
    );

    const awsAccessSecret = new secretsmanager.Secret(
      this,
      props.secretsManager.awsAccessSecret.constructId,
      {
        secretObjectValue: {
          awsAccessKeyId: cdk.SecretValue.unsafePlainText(""),
          awsSecretAccessKey: cdk.SecretValue.unsafePlainText(""),
        },
        description: `AWS Access config (${props.mode} - the secret value need to be set manually on AWS console)`,
      }
    );
    const azureOpenAISecret = new secretsmanager.Secret(
      this,
      props.secretsManager.azureOpenAISecret.constructId,
      {
        secretObjectValue: {
          azureOpenAIEndpoint: cdk.SecretValue.unsafePlainText(""),
          azureOpenAIAPIKey: cdk.SecretValue.unsafePlainText(""),
        },
        description: `Azure OpenAI config (${props.mode} - the secret value need to be set manually on AWS console)`,
      }
    );
    ///////////////////
    // SQS
    ///////////////////
    const sqsQueue = new sqs.Queue(this,props.sqs.queue.constructId, {
      queueName:props.sqs.queue.name,
      visibilityTimeout: cdk.Duration.minutes(10), //可視性タイムアウト10分
    });
    ///////////////////
    // Database
    ///////////////////

    let envVars = {};

    const instanceType = 
      props.mode === "prod" || props.mode === "staging"
        ? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.SMALL)
        : ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO);

    const multiAz = props.mode === "prod";
    const deletionProtection = props.mode === "prod";
    const maxAllocatedStorate = props.mode === "prod" ? 300: 50;

    const dbInstance = new rds.DatabaseInstance(
      this,
      props.rds.dbCluster.constructId,
      {
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        databaseName: props.rds.dbCluster.dbName,
        securityGroups: [isolatedSg],
        engine: rds.DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_8_0,
        }),
        instanceType,
        credentials: rds.Credentials.fromSecret(
          dbSecret,
          dbSecret.secretValueFromJson("username").unsafeUnwrap()
        ),
        allocatedStorage: 21,
        maxAllocatedStorage: maxAllocatedStorate,
        backupRetention: cdk.Duration.days(props.rds.dbCluster.backupRetention),
        preferredBackupWindow: props.rds.dbCluster.backupPreferredWindow,
        publiclyAccessible: false,
        multiAz,
        deletionProtection,
        storageEncrypted: true,
      }
    );

    // Environment variables used in ECS task definition (api container)
    envVars = {
      DEPLOY_ENV: props.mode,
      DB_WRITE_HOST: dbInstance.instanceEndpoint.hostname,
      DB_WRITE_PORT: dbInstance.instanceEndpoint.port,
      DB_READ_HOST: dbInstance.instanceEndpoint.hostname,
      DB_READ_PORT: dbInstance.instanceEndpoint.port,
      SQS_QUEUE_NAME: sqsQueue.queueName,
      AWS_SQS_URL: sqsQueue.queueUrl,
      REDIS_DB: "0",
      ENVIRONMENT: props.mode,
    };
    ///////////////////
    // ECS
    ///////////////////

    const apiRepository = new ecr.Repository(
      this,
      props.ecr.appRepo.constructId,
      {
        //repositoryName: props.ecr.ecr.apiRepo,name,
        imageScanOnPush: true,
        removalPolicy:
          props.mode == "prod"
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: !(props.mode == "prod"),
      }
    );
    apiRepository.addLifecycleRule({
      maxImageCount: 3,
    });
    
    const nginxRepository = new ecr.Repository(
      this,
      props.ecr.nginxRepo.constructId,
      {
        //repositoryName: props.ecr.ecr.nginxRepo,name,
        imageScanOnPush: true,
        removalPolicy:
          props.mode == "prod"
            ? cdk.RemovalPolicy.RETAIN
            : cdk.RemovalPolicy.DESTROY,
        emptyOnDelete: !(props.mode == "prod"),
      }
    );
    nginxRepository.addLifecycleRule({
      maxImageCount: 3,
    });
    ///////////////////
    // ELB
    ///////////////////

    const lb = new elbv2.ApplicationLoadBalancer(
      this,
      props.elb.lb.constructId,
      {
        vpc: vpc,
        loadBalancerName :props.elb.lb.name,
        internetFacing: true,
        securityGroup: publicSg,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC,
        },
      }
    );

    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      props.elb.targetGroup.constructId,
      {
        targetType: elbv2.TargetType.IP,
        vpc: vpc,
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        healthCheck: {
          path: props.elb.targetGroup.healthChekPath,
          healthyHttpCodes: "200",
          healthyThresholdCount: 2,
          interval: cdk.Duration.seconds(10),
        },
      }
    );

    //ARN

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      props.elb.certificate.constructId,
      props.elb.certificate.arn
    );

    // lb.addListener(props.elb.listener.https.constructId, {
    //   port: 443,
    //   defaultTargetGroups: [targetGroup],
    //   certificates: [certificate],
    // });

    // lb.addListener(props.elb.listener.http.constructId, {
    //   port: 80,
    //   defaultAction: elbv2.ListenerAction.redirect({
    //       protocol: elbv2.ApplicationProtocol.HTTPS,
    //   }),
    // });

    lb.addListener(props.elb.listener.http.constructId, {
      port: 80,
      // defaultAction: elbv2.ListenerAction.redirect({
      //     protocol: elbv2.ApplicationProtocol.HTTPS,
      // }),
      defaultTargetGroups: [targetGroup],
    });
    ///////////////////
    // WAF
    ///////////////////

    interface WafRule {
      name:string;
      rule: wafv2.CfnWebACL.RuleProperty;
    }

    const awsManagedRules :WafRule[] = [
      //AWS IP Reputation list incluudes malicious actors/bots and is regularly updated
      {
        name: "AWS-AWSManagedRulesAmazonIpReputationList",
        rule: {
          name: "AWS-AWSManagedRulesAmazonIpReputationList",
          priority: 10,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesAmazonIpReputationList",
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWS-AWSManagedRulesAmazonIpReputationList"
          },
        },
      },
      //レートリミットルールを追加
      {
        name: "RateLimitRule",
        rule: {
          name: "RateLimitRule",
          priority: 15,
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: "IP",
            },
          },
          action: {
            block: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "RateLimitRule",
          },
        },
      },
      //The core rule set (CRS) rule group contains rules that are generally applicable to web applications
      {
        name: "AWS-AWSManagedRulesAmazonCommonRuleSet",
        rule: {
          name: "AWS-AWSManagedRulesAmazonCommonRuleSet",
          priority: 20,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesCommonRuleSet",
              //excludeRules: [],
              ruleActionOverrides: [
                {
                  name: "SizeRestrictions_BODY",
                  actionToUse: {
                    count: {},
                  },
                },
              ],
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWS-AWSManagedRulesAmazonCommonRuleSet"
          },
        },
      },
      //Blocks common SQL injection
      {
        name: "AWSManagedRulesSQLiRuleSet",
        rule: {
          name: "AWSManagedRulesSQLiRuleSet",
          priority: 30,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesSQLiRuleSet",
              //excludeRules: [],
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWSManagedRulesSQLiRuleSet"
          },
        },
      },
      //Blocks attacks targeting LFI(Local File Injection) for linux systems
      {
        name: "AWSManagedRulesLinux",
        rule: {
          name: "AWSManagedRulesLinux",
          priority: 50,
          statement: {
            managedRuleGroupStatement: {
              vendorName: "AWS",
              name: "AWSManagedRulesLinuxRuleSet",
              //excludeRules: [],
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: "AWSManagedRulesLinux"
          },
        },
      },
    ];

    const backendWebACL = new wafv2.CfnWebACL(
      this,
      props.waf.backendApp.constructId,
      {
        defaultAction: {
          allow: {},
        },
        scope: props.waf.backendApp.scope,
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: props.waf.backendApp.metricName,
          sampledRequestsEnabled: true,
        },
        name: props.waf.backendApp.name,
        rules: awsManagedRules.map((wafRule) => wafRule.rule),
      }
    );

    new wafv2.CfnWebACLAssociation(
      this,
      props.waf.backendApp.webACLAssociation.constructId,
      {
        resourceArn: lb.loadBalancerArn,
        webAclArn: backendWebACL.attrArn,
      }
    );
    

    ///////////////////
    // ECS
    ///////////////////

    // Cluster and Task definitions
    const cluster = new ecs.Cluster(
      this,
      props.ecs.cluster.constructId,
      {
        vpc: vpc,
        enableFargateCapacityProviders: true,
      }
    );

    let taskCpu = 1024; // 1 vCPU if dev
    let taskMemory = 2048; // 2 GB if dev
    if(props.mode == "staging") {
      taskCpu = 1024; // 1 vCPU if staging
      taskMemory = 2048; // 2 GB if staging
    } else if (props.mode == "prod") {
      taskCpu = 1024; // 1 vCPU if prod
      taskMemory = 2048; // 2 GB if prod
    }

    const appTaskDef = new ecs.FargateTaskDefinition(
      this,
      props.ecs.taskDef.app.constructId,
      {
        cpu: taskCpu,
        memoryLimitMiB: taskMemory,
        ephemeralStorageGiB: 21,
      }
    );

    const nginxContainer = appTaskDef.addContainer(
      props.ecs.container.nginx.id,
      {
        containerName: props.ecs.container.nginx.name,
        image: ecs.ContainerImage.fromEcrRepository(nginxRepository),
        portMappings: [
          {
          containerPort: 80,
          appProtocol:ecs.AppProtocol.http,
          name: props.ecs.container.nginx.portMappingName.http,
          },
        ],
        logging: ecs.LogDriver.awsLogs({
          streamPrefix: "ecs",
        }),
      }
    );

    const appContainer = appTaskDef.addContainer(props.ecs.container.app.id, {
      containerName: props.ecs.container.app.name,
      image: ecs.ContainerImage.fromEcrRepository(apiRepository),
      logging: ecs.LogDriver.awsLogs({
          streamPrefix: "ecs",
    }),
    environment: envVars,
    secrets: {
      DB_WRITE_NAME: ecs.Secret.fromSecretsManager(dbSecret,"dbname"),
      DB_WRITE_USER: ecs.Secret.fromSecretsManager(dbSecret,"username"),
      DB_WRITE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret,"password"),
      DB_READ_NAME: ecs.Secret.fromSecretsManager(dbSecret,"dbname"),
      DB_READ_USER: ecs.Secret.fromSecretsManager(dbSecret,"username"),
      DB_READ_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret,"password"),
      AWS_ACCESS_KEY_ID: ecs.Secret.fromSecretsManager(awsAccessSecret,"awsAccessKeyId"),
      AWS_SECRET_ACCESS_KEY: ecs.Secret.fromSecretsManager(awsAccessSecret,"awsAccessKeyKey"),
      AZURE_OPENAI_ENDPOINT: ecs.Secret.fromSecretsManager(azureOpenAISecret,"azureOpenAIEndpoint"),
      AZURE_OPENAI_KEY: ecs.Secret.fromSecretsManager(azureOpenAISecret,"azureOpenAIKey"),
    },
    //Running "collectstatic" at rutime so that static files can be found by NGINX
    command: [
      "bin/bash",
      "-c",
      "python manage.py collectstatic --noinput && gunicorn --bind=unix: /var/run/gunicorn/gunicorn.sock config.wsgi:application --workers=2 --timeout 300 --keep-alive 65",
    ],
  });

  const celeryContainer = appTaskDef.addContainer(
    props.ecs.container.celery.id,
    {
      containerName: props.ecs.container.celery.name,
      image: ecs.ContainerImage.fromEcrRepository(apiRepository),
      logging: ecs.LogDriver.awsLogs({
          streamPrefix: "ecs",
    }),
      environment: envVars,
      secrets: {
        DB_WRITE_NAME: ecs.Secret.fromSecretsManager(dbSecret,"dbname"),
        DB_WRITE_USER: ecs.Secret.fromSecretsManager(dbSecret,"username"),
        DB_WRITE_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret,"password"),
        DB_READ_NAME: ecs.Secret.fromSecretsManager(dbSecret,"dbname"),
        DB_READ_USER: ecs.Secret.fromSecretsManager(dbSecret,"username"),
        DB_READ_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret,"password"),
        AWS_ACCESS_KEY_ID: ecs.Secret.fromSecretsManager(awsAccessSecret,"awsAccessKeyId"),
        AWS_SECRET_ACCESS_KEY: ecs.Secret.fromSecretsManager(awsAccessSecret,"awsAccessKeyKey"),
        AZURE_OPENAI_ENDPOINT: ecs.Secret.fromSecretsManager(azureOpenAISecret,"azureOpenAIEndpoint"),
        AZURE_OPENAI_KEY: ecs.Secret.fromSecretsManager(azureOpenAISecret,"azureOpenAIKey"),
      },
      //Running "collectstatic" at rutime so that static files can be found by NGINX
      command: [
      "bin/bash",
      "-c",
      "celery -A config worker -l INFO --concurrency=2",
      ],
    }
  );

  const gunicornVolume: cdk.aws_ecs.Volume = {
    name: props.ecs.taskDef.app.storage.gunicorn.volumeName
  };
  const staticFilesVolume: cdk.aws_ecs.Volume = {
    name: props.ecs.taskDef.app.storage.static.volumeName,
  };

  appTaskDef.addVolume(gunicornVolume);
  appTaskDef.addVolume(staticFilesVolume);

  appContainer.addMountPoints(
    {
      containerPath:
        props.ecs.taskDef.app.storage.gunicorn.mountPointPath.app,
      readOnly: false,
      sourceVolume: props.ecs.taskDef.app.storage.gunicorn.volumeName,
    },
    {
      containerPath:
        props.ecs.taskDef.app.storage.static.mountPointPath.app,
      readOnly: false,
      sourceVolume: props.ecs.taskDef.app.storage.static.volumeName,
    },
  );
  nginxContainer.addMountPoints(
    {
      containerPath:
        props.ecs.taskDef.app.storage.gunicorn.mountPointPath.nginx,
      readOnly: false,
      sourceVolume: props.ecs.taskDef.app.storage.gunicorn.volumeName,
    },
    {
      containerPath:
        props.ecs.taskDef.app.storage.static.mountPointPath.nginx,
      readOnly: false,
      sourceVolume: props.ecs.taskDef.app.storage.static.volumeName,
    },
  );

  //services
  const appService = new ecs.FargateService(
    this,
    props.ecs.service.app.constructId,
    {
      cluster: cluster,
      taskDefinition: appTaskDef,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [privateSg],
      // desiredCount: props.mode === "prod" ? 2 : 1,
      desiredCount: 0,
      assignPublicIp: false,
      capacityProviderStrategies: [
        {
          capacityProvider: "FARGATE",
          weight: 1,
        },
      ],
      circuitBreaker: {
        rollback: true,
      },
    }
  );

  targetGroup.addTarget(appService);

  const scaling = appService.autoScaleTaskCount({
    minCapacity: props.mode === "prod" ? 2 : 1,
    maxCapacity: props.mode === "prod" ? 3 : 2,
  });

  scaling.scaleOnCpuUtilization("CpuScaling", {
    targetUtilizationPercent: 80,
  });
  scaling.scaleOnMemoryUtilization("MemoryScaling", {
    targetUtilizationPercent: 80,
  });
  ///////////////////
  // Frontend: S3 + CloudFront (+ WAF)
  ///////////////////

  //S3 bucket for frontend hosting (private,accessd via CloudFront OAI)
  const frontendBucket = new s3.Bucket(
    this,
    props.frontend.s3.constructId,
    {
      bucketName: props.frontend.s3.bucketName,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy:
        props.mode == "prod"
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !(props.mode == "prod"),
    }
  );

  //CloudFront Origin Access Identity
  const frontendOai = new cloudfront.OriginAccessIdentity(
    this,
    "FrontendOAI",
    {
      comment: `OAI for ${props.frontend.s3.bucketName}`,
    }
  );
  frontendBucket.grantRead(frontendOai);

  // // Optional: ACM certificate and custom domain for CloudFront
  // let cfCertificate: acm.ICertificate | undefined = undefined;
  // const hasCustomDomain = Boolean(
  //   props.frontend.cloudfront.domainName &&
  //     props.frontend.cloudfront.certificateArn
  // );
  // if (hasCustomDomain) {
  //   cfCertificate = acm.Certificate.fromCertificateArn(
  //     this,
  //     "FrontendSSLCertificate",
  //     props.frontend.cloudfront.certificateArn as string
  //   );
  // }

  // CloudFront Distribution (SPA fallback: 403/404 -> /index.html)
  // API用オリジン (ALB)を作成し、/api/*をALBへプロキシ
  const apiOrigin = new origins.HttpOrigin(lb.loadBalancerDnsName, {
    protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
    httpsPort: 80,
    originPath: "",
  });


  //default behaivior options (attach function if defined)
  const defaultBehaviorOptions: cloudfront.BehaviorOptions = {
    origin: new origins.S3Origin(frontendBucket, {
      originAccessIdentity: frontendOai,
    }),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
    // ...(ipWhitelistFunction
    //   ? {
    //       functionAssociations: [
    //         {
    //         function: ipWhitelistFunction,
    //         eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
    //         },
    //       ],
    //     }
    //   : {}),
    };

    const frontendDistribution = new cloudfront.Distribution(
      this,
      props.frontend.cloudfront.constructId,
      {
        defaultRootObject: "index.html",
        // domainNames: hasCustomDomain
        //   ? [props.frontend.cloudfront.domainName as string]
        //   : undefined,
        // certificate: CfnCACertificate,
        defaultBehavior: defaultBehaviorOptions,
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
        ],
        comment: props.frontend.cloudfront.distributionName,
        priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      }
    );

    // /api/* をALBへプロキシするビヘイビア
    const apiBehabiorOptions: cloudfront.BehaviorOptions = {
      origin: apiOrigin,
      allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      originRequestPolicy:
        cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy:
        cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      // ...(ipWhitelistFunction
      //   ? {
      //     functionAssociations: [
      //       {
      //         function: ipWhitelistFunction,
      //         eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
      //       },
      //     ],
      //   }
      // : {}),
    };
    frontendDistribution.addBehavior("/api/*", apiOrigin, apiBehabiorOptions);
  }
}
//test