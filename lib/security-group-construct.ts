#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
  
export interface SecurityGroupConstructProps {
  vpc: ec2.IVpc; // VPC を外から渡す
}

export class SecurityGroupConstruct extends Construct {
  public readonly albSG: ec2.SecurityGroup;
  public readonly ecsSG: ec2.SecurityGroup;
  public readonly rdsSG: ec2.SecurityGroup;
  
  constructor(scope: Construct, id: string, props: SecurityGroupConstructProps) {
    super(scope, id);

    // ALB用SG
    this.albSG = new ec2.SecurityGroup(this, 'AlbSG', {
      vpc: props.vpc,
      securityGroupName: 'saitou-yuta-cdk-ecsalbsg',
      description: 'ALB security group',
      allowAllOutbound: false, // ALBはインターネットアクセス可能
    });
    cdk.Tags.of(this.albSG).add('Owner', 'saitou-yuta');

    // ECS用SG
    this.ecsSG = new ec2.SecurityGroup(this, 'EcsSG', {
      vpc: props.vpc,
      securityGroupName: 'saitou-yuta-cdk-ecssg',
      description: 'ECS tasks security group',
      allowAllOutbound: false, // タスクからのアウトバウンド許可
    });
    cdk.Tags.of(this.ecsSG).add('Owner', 'saitou-yuta');
    // RDS用SG
    this.rdsSG = new ec2.SecurityGroup(this, 'RdsSG', {
      vpc: props.vpc,
      securityGroupName: 'saitou-yuta-cdk-rdssg',
      description: 'RDS security group',
      allowAllOutbound: false, 
    });
    cdk.Tags.of(this.rdsSG).add('Owner', 'saitou-yuta');
    //接続ルールの定義
    //ALB用SG
    //インバウンド
    this.albSG.connections.allowFromAnyIpv4(ec2.Port.tcp(80), 'Allow HTTP');
    this.albSG.connections.allowFromAnyIpv4(ec2.Port.tcp(443), 'Allow HTTPS');
    //アウトバウンド
    this.albSG.connections.allowTo(this.ecsSG,ec2.Port.tcp(80), 'Allow HTTP t o ECS tasks');
    //ECS用SG
    //インバウンド
    this.ecsSG.connections.allowFrom(this.albSG,ec2.Port.tcp(80), 'Allow HTTP from ALB');
    //アウトバウンド
    this.ecsSG.connections.allowToAnyIpv4(ec2.Port.tcp(443), 'Allow HTTPS to ECS tasks');    
    this.ecsSG.connections.allowTo(this.rdsSG,ec2.Port.tcp(3306), 'Allow ECS to RDS'); 
    // RDS用SG
    //インバウンド
    this.rdsSG.connections.allowFrom(this.ecsSG,ec2.Port.tcp(3306), 'Allow ECS from RDS');
  }
}
