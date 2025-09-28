import * as fs from "fs"
import * as path from "path";
import * as yaml from "yaml";
import * as _ from "lodash";

export const loadEnvironmentVariablesFile = (
  mode: "dev" | "staging" | "prod",
  stack: "infra",
  envDirPath: string = path.join(process.cwd(),"env")//現在の作業ディレクトリの取得
) => {
  return _.merge(
    yaml.parse(
      fs.readFileSync(path.join(envDirPath, mode, `${stack}.yml`),"utf-8")
    )
  );
};

const ipv4CidrRegex = 
  /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9][01]?[0-9][0-9]?)(\/[0-9]|[1-2][0-9]|3[0-2])$/;
  function isValidIpv4Cidr(cidr: string):boolean {
    return ipv4CidrRegex.test(cidr);
  }


export function vaidateIpv4List(cidrList:string[]): string[] {
  return cidrList.filter((cidr) => !isValidIpv4Cidr(cidr));
}

