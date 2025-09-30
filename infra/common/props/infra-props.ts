import * as cdk from 'aws-cdk-lib';

interface InfraProps extends cdk.StackProps {
  mode: "dev" | "staging" | "prod";
  fileWebAclArn: string;
  vpc: {
    vpc: {
      constructId: string;
      cidr: string;
    };
    securityGroup: {
      public: { 
        constructId: string ;
      };
      private: {
        constructId: string;
      };
      bastion: {
        constructId: string;
        peerIpAddresses: string;
      };
      isolated: {
        constructId: string;
      };
    };
  };
  secretsManager: {
    dbSecret: {
      constructId: string;
      username: string;
      dbName: string;
    };
    djangoSecret: {
      constructId: string;
    };
    awsAccessSecret: {
      constructId: string;
    };
    azureOpenAISecret: {
      constructId: string;
    };
    azureSpeechServiceSecret: {
      constructId: string;
    };
  };
  rds: {
    dbCluster: {
      constructId: string;
      identifier:string;
      dbName: string;
      masterUsername: string;
      backupRetention: number;
      backupPreferredWindow: string;
      allocatedStorage :number;
      maxAllocatedStorage: number;
      writer: {
        constructId: string;
      };
      reader: {
        constructId: string;
      };
    };
    bastion: {
      constructId: string;
      keyPair: {
        constructId: string;
      };
    };
  };
  ecr: {
    appRepo: {
      constructId: string;
    };
    nginxRepo: {
      constructId: string;
    };
  };
  elb: {
    lb: {
      constructId: string;
      name: string;
    };
    listener: {
      http: {
        constructId: string;
      };
      https: {
        constructId: string;
      };
    };
    targetGroup: {
      constructId: string;
      healthChekPath: string;
    };
    certificate: {
      constructId: string;
      arn: string;
    };
  };
  waf: {
    backendApp: {
      constructId: string;
      scope: string;
      metricName: string;
      name: string;
      webACLAssociation: {
        constructId: string;
      };
      ipSet: {
        v4: {
          constructId: string;
          scope: string;
        };
        v6: {
          constructId: string;
          scope: string;
        };
      };
      ipWhitelistBucket: {
        name: string;
        ipv4Filename: string;
        ipv6Filename: string;
      };
    };
  };
  ecs: {
    cluster: {
      constructId: string;
    };
    service: {
      app: {
        constructId: string;
        desiredCount: number;
      };
    };
    taskDef: {
      app: {
        constructId: string;
        storage: {
          gunicorn: {
            volumeName: string;
            mountPointPath: {
              app: string;
              nginx: string;
            };
          };
          static: {
            volumeName: string;
            mountPointPath: {
              app:string;
              nginx: string;
            };
          };
        };
      };
    };
    container: {
      app: {
        id: string;
        name: string;
      };
      nginx: {
        id: string;
        name: string;
        portMappingName: {
          http: string;
          https: string;
        };
      };
      celery: {
        id: string;
        name: string;
      };
    };
  };
  s3: {
    bucket: {
      uploaded_files: {
        constructId: string;
        name: string;
      };
    };
    lifecyclerule: {
      uploaded_files: {
        name: string;
      };
    };
  };
  sqs: {
    queue: {
      constructId: string;
      name: string;
    };
  };
  frontend: {
    s3: {
      constructId: string;
      backetName: string;
    };
    cloudfront: {
      constructId: string;
      distributionName?: string;
      certificateArn?: string;
      domainName?: string;
      ipAllowlist?: {
        ipv4Cidrs?: string[];
        ipv6Cidrs?: string[];
      };
      waf: {
        constructId: string;
        name: string;
        scope: string;
        metricName: string;
        webACLAssocitation: {
          constructId: string;
        };
      };
    };
  };
}
export default InfraProps;