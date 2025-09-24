import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VpcConstruct } from "./vpc-construct";
import { SecurityGroupConstruct } from "./security-group-construct";
import { EcsAlbConstruct } from "./ecs-alb-construct";
import { RdsConstruct } from "./rds-construct";
import { CloudFrontS3Construct } from "./cloudfront-s3-construct";

export interface TotalStackProps extends cdk.StackProps {
  wafWebAclArn: string;
}

export class TotalStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TotalStackProps) {
    super(scope, id, props);

    // VPC
    const vpcConstruct = new VpcConstruct(this, "VpcConstruct", {
      cidr: "10.120.16.0/24",
    });

    // Security Groups (VPC を渡す)
    const sgConstruct = new SecurityGroupConstruct(this, "SecurityGroupConstruct", {
      vpc: vpcConstruct.vpc,
    });
    
    const rdsConstruct = new RdsConstruct(this, "RdsConstruct", {
      vpc: vpcConstruct.vpc,
      rdsSecurityGroup: sgConstruct.rdsSG,
    });

    const ecsAlbConstruct = new EcsAlbConstruct(this, "EcsAlbConstruct", {
      vpc: vpcConstruct.vpc,
      ecsSecurityGroup: sgConstruct.ecsSG,
      albSecurityGroup: sgConstruct.albSG,
      dbName: rdsConstruct.dbName, 
      dbSecret: rdsConstruct.dbSecret,
      dbHost: rdsConstruct.rdsInstance.dbInstanceEndpointAddress,
    });
    
    const cloudFrontS3 = new CloudFrontS3Construct(this, 'CloudFrontS3Construct', {
      certificateArn: 'arn:aws:acm:us-east-1:133285731447:certificate/260aa380-6069-40d9-b852-afb261e055b3',
      webAclArn: props.wafWebAclArn, // CloudFrontWafStack から取得
      domainName: 'cftest.y-koutiku-test.com',
      bucketName: 'saitou-yuta-cdk-site-bucket',
    });

    // 今後 ALB/ECS/RDS などで sgConstruct の SG を利用可能
    // 例: sgConstruct.albSg, sgConstruct.ecsSg, sgConstruct.rdsSg
  }
}
