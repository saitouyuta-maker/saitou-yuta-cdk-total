import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { CrossRegionGetParameter } from './cloudfrontssm-construct';//ssmの呼び出しのため
import { CloudFrontToS3 } from '@aws-solutions-constructs/aws-cloudfront-s3';

export interface CloudFrontS3ConstructProps {
  certificateArn: string;
  webAclArn: string;
  domainName: string;
  bucketName?: string;
}

export class CloudFrontS3Construct extends Construct {
  public readonly bucket: s3.Bucket;
  public readonly distribution: CloudFrontToS3;

  constructor(scope: Construct, id: string, props:CloudFrontS3ConstructProps) {
    super(scope, id);

    const account = cdk.Stack.of(this).account;
    const region = cdk.Stack.of(this).region;

    // 既存の ACM 証明書を ARN からインポート
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      'Certificate',
      props.certificateArn
    );
    //SSMパラメーターストアからWebACLのArnを取得
    const webAclArnParameter = new CrossRegionGetParameter(
      this,
      'WebAclArnParameter',
      {
        parameterName: 'saitou-yuta-cdk-webacl',
        region: 'us-east-1',
      }
    );

    // S3 バケット (CloudFront 以外からのアクセスは遮断)
    this.bucket = new s3.Bucket(this, 'MySiteBucket', {
      bucketName: 'saitou-yuta-cdk-site-bucket',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // テスト用。本番は RETAIN 推奨
      autoDeleteObjects: true, // テスト用
    });
    cdk.Tags.of(this.bucket).add('Owner', 'saitou-yuta');


    // OAC 作成
    const oac = new cloudfront.S3OriginAccessControl(this, 'MyOAC', {
        originAccessControlName: 'saitou-yuta-cdk-S3-OAC',
    });
    this.distribution = new CloudFrontToS3(this, 'MyDistribution', {
      existingBucketObj: this.bucket,
      cloudFrontDistributionProps: {
      defaultBehavior: {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    },
        domainNames: ['cftest.y-koutiku-test.com'],
        certificate: certificate,
  },
});
    // WebACL を Distribution に関連付け
    const cfnDistribution = this.distribution.cloudFrontWebDistribution.node.defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride('DistributionConfig.WebACLId', webAclArnParameter.parameterValue);


    // S3 バケットポリシーに CloudFront(OAC) を許可
    this.bucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${this.bucket.bucketArn}/*`],
      principals: [
        new cdk.aws_iam.ServicePrincipal('cloudfront.amazonaws.com'),
      ],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${account}:distribution/${this.distribution.cloudFrontWebDistribution.distributionId}`,//distributionは変数名
        },
      },
    }));
  }
}
