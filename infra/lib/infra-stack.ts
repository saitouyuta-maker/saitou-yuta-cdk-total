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
  }
}
