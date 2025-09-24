#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface RdsConstructProps {
  vpc: ec2.IVpc;
  rdsSecurityGroup: ec2.ISecurityGroup;
}

export class RdsConstruct extends Construct {
  public readonly rdsInstance: rds.DatabaseInstance;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly dbName: string; 
  constructor(scope: Construct, id: string, props: RdsConstructProps) {
    super(scope, id);

    // データベースパスワードを Secrets Manager で生成
    this.dbSecret = new secretsmanager.Secret(this, 'DbSecret', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
      },
    });
    this.dbName = "mydb";

    //サブネットグループ作成
    const rdsSubnetGroup = new rds.SubnetGroup(this, 'RdsSubnetGroup', {
      description: 'My isolated subnets for RDS',
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      subnetGroupName: 'saitou-yuta-rds-cdk-subnet-group', 
    });

    // RDS インスタンス作成
    this.rdsInstance = new rds.DatabaseInstance(this, 'MyRdsInstance', {
      engine: rds.DatabaseInstanceEngine.mysql({
      version: rds.MysqlEngineVersion.of('8.0.43','8.0'), 
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO),
      vpc: props.vpc,
      subnetGroup: rdsSubnetGroup, 
      securityGroups: [props.rdsSecurityGroup],
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      publiclyAccessible: false,
      databaseName: this.dbName,
      instanceIdentifier:'saitou-yuta-cdk-rds',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // テスト用、本番は RETAIN 推奨
      storageEncrypted: true,
    });

    // タグを追加
    cdk.Tags.of(this.rdsInstance).add('Name', 'saitou-yuta-rds');
    cdk.Tags.of(this.rdsInstance).add('Owner', 'saitou-yuta-cdk-rds');
  }
}

