#!/usr/bin/env node
import "source-map-support/register"
import * as cdk from 'aws-cdk-lib';
// import { CloudFrontS3Stack } from '../lib/CloudFrontS3Stack';
import { InfraStack } from '../lib/infra-stack';
import {loadEnvironmentVariablesFile} from "../common/utils";

const app = new cdk.App();
const mode =
  process.env.DEPLOY_ENV === "prod"
    ? "prod"
    : process.env.DEPLOY_ENV === "staging"
      ? "staging"
      : "dev";

const mainEnv = loadEnvironmentVariablesFile(mode, "infra");

const mainStackDeployEnv = {
  account: process.env.CDK_DEFFAULT_ACCOUNT,
  region: mainEnv.reagion,
};

const mainStack = new InfraStack(app,mainEnv.stackId, {
  mode: mode,
  env: mainStackDeployEnv,
  ...mainEnv,
});

app.synth();