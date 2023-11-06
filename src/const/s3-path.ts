import { PROD, STAGE } from './stage';

export class S3Path {
  static bucket() {
    if (STAGE === PROD) {
      return 'wds-code-build';
    }
    return 'wds-code-build-dev';
  }

  static outKey(
    chainName: string,
    chainId: string,
    account: string,
    timestamp: string,
    filetype: string,
  ) {
    return `${chainName}/${chainId}/${account}/${timestamp}/${timestamp}.zip`;
  }
}
