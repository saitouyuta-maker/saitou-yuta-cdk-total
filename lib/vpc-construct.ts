#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export interface VpcConstructProps {
  cidr: string;
}

//作成した VPC オブジェクトを公開 他の Constructから参照可能
export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnets: ec2.ISubnet[];
  public readonly ecsSubnets: ec2.ISubnet[];
  public readonly rdsSubnets: ec2.ISubnet[];

  //propsはcidrが渡されている
  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);
  //VPC作成
    this.vpc = new ec2.Vpc(this, 'MyVpc', {
      ipAddresses: ec2.IpAddresses.cidr(props.cidr),
      maxAzs: 2,
      natGateways: 2,
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 27,
        },
        {
          name: 'EcsPrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 27,
        },
        {
          name: 'RdsPrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 27,
        },
      ],
    });
    cdk.Tags.of(this.vpc).add('Name', 'saitou-yuta-cdk-vpc');
    cdk.Tags.of(this.vpc).add('Owner', 'saitou-yuta');
    
    //他リソースで作成したサブネット配列を使用するために定義しておく
    this.publicSubnets = this.vpc.selectSubnets({ subnetType: ec2.SubnetType.PUBLIC }).subnets;
    this.ecsSubnets = this.vpc.selectSubnets({ subnetGroupName: 'EcsPrivateSubnet' }).subnets;
    this.rdsSubnets = this.vpc.selectSubnets({ subnetGroupName: 'RdsPrivateSubnet' }).subnets;

    // 各サブネットにタグ付け
    this.publicSubnets.forEach((sub, i) => {
      cdk.Tags.of(sub).add('Name', `saitou-yuta-cdk-public-${i+1}`);
      cdk.Tags.of(sub).add('Owner', 'saitou-yuta');
    });

    this.ecsSubnets.forEach((sub, i) => {
      cdk.Tags.of(sub).add('Name', `saitou-yuta-cdk-ecs-private-${i+1}`);
      cdk.Tags.of(sub).add('Owner', 'saitou-yuta');
    });

    this.rdsSubnets.forEach((sub, i) => {
      cdk.Tags.of(sub).add('Name', `saitou-yuta-cdk-rds-private-${i+1}`);
      cdk.Tags.of(sub).add('Owner', 'saitou-yuta');
    });

    // 他スタックから参照するようとして出力
    new cdk.CfnOutput(this, 'VpcIdOutput', { value: this.vpc.vpcId });
  }
}
