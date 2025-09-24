import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class CloudFrontWafStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props?:cdk.StackProps) {
    super(scope, id, props);

    const webAcl = new wafv2.CfnWebACL(this, 'MyWebAcl', {
      name: 'saitou-yuta-cdk-webacl', 
      defaultAction: { allow: {} },
      scope: 'CLOUDFRONT', // CloudFront 用
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'saitou-yuta-cdk-cloudfront-waf',
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'saitou-yuta-cdk-commonRules',
            sampledRequestsEnabled: true,
          },
        },
      ],
      tags: [
        { key: 'Owner', value: 'saitou-yuta' },
      ],
    });

    // WAF 作成後
    new ssm.StringParameter(this, 'WebAclArnParameter', {
      parameterName: 'saitou-yuta-cdk-webacl',
      stringValue: webAcl.attrArn,
    });
    
    new cdk.CfnOutput(this, 'WebAclArnOutput', { value: webAcl.attrArn });
  }
}
