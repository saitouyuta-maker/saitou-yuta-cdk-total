import { custom_resources } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CrossRegionGetParameter extends Construct {
  public readonly parameterValue: string;

  constructor(scope: Construct,id: string,props: {
      readonly parameterName: string;
      readonly region: string;
    }
  ) {
    super(scope, id);
    const getParameter = new custom_resources.AwsCustomResource(
      this,
      'GetParameterCustomResource',
      {
        onUpdate: {
          service: 'SSM',
          action: 'getParameter',
          parameters: {
            Name: props.parameterName,
          },
          physicalResourceId: custom_resources.PhysicalResourceId.of(
            props.parameterName
          ),
          region: props.region,
        },
        policy: custom_resources.AwsCustomResourcePolicy.fromSdkCalls({
          resources: custom_resources.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
        installLatestAwsSdk: false,
      }
    );

    this.parameterValue = getParameter.getResponseField('Parameter.Value');
  }
}