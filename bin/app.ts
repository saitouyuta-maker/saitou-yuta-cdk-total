#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { TotalStack } from '../lib/total';
// import { CloudFrontS3Stack } from '../lib/CloudFrontS3Stack';
import { CloudFrontWafStack } from '../lib/CloudFrontWafStack';

const app = new cdk.App();

const env = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: process.env.CDK_DEFAULT_REGION 
};

const wafenv = { 
  account: process.env.CDK_DEFAULT_ACCOUNT, 
  region: 'us-east-1'
};
const wafStack = new CloudFrontWafStack(app, 'CloudFrontWafStack', {env: wafenv});
const totalStack = new TotalStack(app, 'TotalStack',{ 
  env,
  wafWebAclArn: wafStack.webAclArn
},);


//const albecsStack = new EcsAlbStack(app, 'EcsAlbStack', { env },);
//const rdsStack = new RdsStack(app, 'RdsStack', { env },);
// const cloudcrontS3Stack = new CloudFrontS3Stack(app, 'CloudFrontS3Stack', { env});