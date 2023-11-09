import React, { useState } from 'react';
import { Alert, Button, Form, InputGroup, OverlayTrigger, Tooltip } from 'react-bootstrap';
import JSZip from 'jszip';
import axios from 'axios';
import { FaSyncAlt } from 'react-icons/fa';
import { Deploy } from './Deploy';
import { io } from 'socket.io-client';
import wrapPromise from '../../utils/wrapPromise';
import { sendCustomEvent } from '../../utils/sendCustomEvent';
import stripAnsi from 'strip-ansi';
import Method from './Method';
import SmartContracts from './SmartContracts';

import * as _ from 'lodash';
import {
  compileIdV2,
  REMIX_APTOS_COMPILE_REQUESTED_V2,
  REMIX_APTOS_PROVE_REQUESTED_V2,
  RemixAptosCompileRequestedV2,
  RemixAptosProveRequestedV2,
  reqIdV2,
} from 'wds-event';

import { APTOS_COMPILER_CONSUMER_ENDPOINT, COMPILER_API_ENDPOINT } from '../../const/endpoint';
import AlertCloseButton from '../common/AlertCloseButton';
import { FileInfo, FileUtil } from '../../utils/FileUtil';
import { readFile, shortenHexString, stringify } from '../../utils/helper';
import { Client } from '@remixproject/plugin';
import { Api } from '@remixproject/plugin-utils';
import { IRemixApi } from '@remixproject/plugin-api';
import { log } from '../../utils/logger';
import {
  aptosNodeUrl,
  ArgTypeValuePair,
  codeBytes,
  dappTxn,
  getEstimateGas,
  genPayload,
  getAccountModules,
  getAccountResources,
  metadataSerializedBytes,
  serializedArgs,
  viewFunction,
} from './aptos-helper';

import { PROD, STAGE } from '../../const/stage';
import { Socket } from 'socket.io-client/build/esm/socket';
import { isEmptyList, isNotEmptyList } from '../../utils/ListUtil';
import { AptosClient, HexString, TxnBuilderTypes, Types } from 'aptos';
import { Parameters } from './Parameters';
import { S3Path } from '../../const/s3-path';
import {
  COMPILER_APTOS_COMPILE_COMPLETED_V2,
  COMPILER_APTOS_COMPILE_ERROR_OCCURRED_V2,
  COMPILER_APTOS_COMPILE_LOGGED_V2,
  COMPILER_APTOS_PROVE_COMPLETED_V2,
  COMPILER_APTOS_PROVE_ERROR_OCCURRED_V2,
  COMPILER_APTOS_PROVE_LOGGED_V2,
  CompilerAptosCompileCompletedV2,
  CompilerAptosCompileErrorOccurredV2,
  CompilerAptosCompileLoggedV2,
  CompilerAptosProveCompletedV2,
  CompilerAptosProveErrorOccurredV2,
  CompilerAptosProveLoggedV2,
} from 'wds-event/dist/event/compiler/aptos/v2/aptos';
import { CHAIN_NAME } from '../../const/chain';
import { BUILD_FILE_TYPE } from '../../const/build-file-type';
import copy from 'copy-to-clipboard';
import EntryButton from './EntryButton';
import Web3 from 'web3';
import { InterfaceContract } from '../../utils/Types';

export interface ModuleWrapper {
  packageName: string;
  path: string;
  module: string;
  moduleName: string;
  moduleNameHex: string;
  order: number;
}

const RCV_EVENT_LOG_PREFIX = `[==> EVENT_RCV]`;
const SEND_EVENT_LOG_PREFIX = `[EVENT_SEND ==>]`;

interface InterfaceProps {
  compileTarget: string;
  accountID: string;
  dapp: any;
  client: Client<Api, Readonly<IRemixApi>>;
}

export const Compiler: React.FunctionComponent<InterfaceProps> = ({
  client,
  compileTarget,
  accountID,
  dapp,
}) => {
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [proveLoading, setProveLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [compileError, setCompileError] = useState<Nullable<string>>(null);
  const [atAddress, setAtAddress] = useState<string>('');
  const [isProgress, setIsProgress] = useState<boolean>(false);
  const [deployedContract, setDeployedContract] = useState<string>('');

  const [packageName, setPackageName] = useState<string>('');
  const [compileTimestamp, setCompileTimestamp] = useState<string>('');
  const [moduleWrappers, setModuleWrappers] = useState<ModuleWrapper[]>([]);
  const [moduleBase64s, setModuleBase64s] = useState<string[]>([]);
  const [metaData64, setMetaDataBase64] = useState<string>('');

  const [modules, setModules] = useState<Types.MoveModuleBytecode[]>([]);
  const [targetModule, setTargetModule] = useState<string>('');
  const [moveFunction, setMoveFunction] = useState<Types.MoveFunction | undefined>();

  const [genericParameters, setGenericParameters] = useState<string[]>([]);
  const [parameters, setParameters] = useState<ArgTypeValuePair[]>([]);

  const [accountResources, setAccountResources] = useState<Types.MoveResource[]>([]);
  const [targetResource, setTargetResource] = useState<string>('');

  const [copyMsg, setCopyMsg] = useState<string>('Copy');

  const [estimatedGas, setEstimatedGas] = useState<string | undefined>();
  const [gasUnitPrice, setGasUnitPrice] = useState<string>('0');
  const [maxGasAmount, setMaxGasAmount] = useState<string>('0');

  const [entryEstimatedGas, setEntryEstimatedGas] = useState<string | undefined>();
  const [entryGasUnitPrice, setEntryGasUnitPrice] = useState<string>('0');
  const [entryMaxGasAmount, setEntryMaxGasAmount] = useState<string>('0');

  const [compiled, setCompiled] = useState<boolean>(false)
  const [deployData, setDeployData] = useState<string>('')
  const [address, setAddress] = React.useState<string>('');
  const [contracts, setContracts] = React.useState<InterfaceContract[]>([]);
  const [contractName, setContractName] = React.useState<string>('');

  
  function addNewContract(contract: InterfaceContract) {
    setContracts(contracts.concat([contract]));
  }

  const setGasUnitPriceValue = (e: { target: { value: React.SetStateAction<string> } }) => {
    setGasUnitPrice(e.target.value);
  };

  const setMaxGasAmountValue = (e: { target: { value: React.SetStateAction<string> } }) => {
    setMaxGasAmount(e.target.value);
  };

  const setEntryGasUnitPriceValue = (e: { target: { value: React.SetStateAction<string> } }) => {
    setEntryGasUnitPrice(e.target.value);
  };

  const setEntryMaxGasAmountValue = (e: { target: { value: React.SetStateAction<string> } }) => {
    setEntryMaxGasAmount(e.target.value);
  };

  const web3 = new Web3('https://stylus-testnet.arbitrum.io/rpc')
  const abi = [
    {
      "inputs": [],
      "name": "increment",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "number",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "new_number",
          "type": "uint256"
        }
      ],
      "name": "setNumber",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]
  const findArtifacts = async () => {
    let artifacts = {};
    try {
      artifacts = await client?.fileManager.readdir('browser/' + compileTarget + '/out');
    } catch (e) {
      log.info(`no out folder`);
    }
    log.debug(`@@@ artifacts`, artifacts);
    return Object.keys(artifacts || {});
  };

  const handleAlertClose = () => {
    setCompileError('');
    client.call('editor', 'discardHighlight');
    client.call('editor', 'clearAnnotations');
  };

  const requestProve = async () => {
    if (proveLoading) {
      await client.terminal.log({ value: 'Server is working...', type: 'log' });
      return;
    }
    const projFiles = await FileUtil.allFilesForBrowser(client, compileTarget);
    log.debug(`@@@ prove projFiles`, projFiles);
    const buildFileExcluded = projFiles.filter((f) => !f.path.startsWith(`${compileTarget}/out`));
    log.debug(`@@@ prove buildFileExcluded`, buildFileExcluded);
    if (isEmptyList(buildFileExcluded)) {
      return;
    }

    const blob = await generateZip(buildFileExcluded);

    await wrappedProve(blob);
  };

  const wrappedRequestCompile = () => wrapPromise(requestCompile(), client);
  const wrappedRequestProve = () => wrapPromise(requestProve(), client);

  const createFile = (code: string, name: string) => {
    const blob = new Blob([code], { type: 'text/plain' });
    return new File([blob], name, { type: 'text/plain' });
  };

  const generateZip = async (fileInfos: Array<FileInfo>) => {
    const zip = new JSZip();

    await Promise.all(
      fileInfos.map(async (fileinfo: FileInfo) => {
        if (!fileinfo.isDirectory) {
          const content = await client?.fileManager.readFile(fileinfo.path);
          const f = createFile(
            content || '',
            fileinfo.path.substring(fileinfo.path.lastIndexOf('/') + 1),
          );
          const chainFolderExcluded = fileinfo.path.substring(fileinfo.path.indexOf('/') + 1);
          const projFolderExcluded = chainFolderExcluded.substring(
            chainFolderExcluded.indexOf('/') + 1,
          );
          zip.file(projFolderExcluded, f);
        }
      }),
    );

    return zip.generateAsync({ type: 'blob' });
  };

  const sendCompileReq = async (blob: Blob) => {
    setCompileError(null);
    sendCustomEvent('compile', {
      event_category: 'arbitrum',
      method: 'compile',
    });
    setLoading(true);

    const address = accountID;
    const timestamp = Date.now().toString();
    setCompileTimestamp(timestamp);
    
    try {
      
      const formData = new FormData();
      formData.append('chainName', CHAIN_NAME.arbitrum);
      formData.append('chainId', 'testnet');
      formData.append('account', address || 'noaddress');
      formData.append('timestamp', timestamp.toString() || '0');
      formData.append('fileType', '');
      formData.append('zipFile', blob || '');

      const respon = await axios.post(COMPILER_API_ENDPOINT + '/s3Proxy/src-v2', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Accept: 'application/json',
        },
      });

      console.log(respon)

      if (respon.status !== 201) {
        log.error(`src upload fail. address=${address}, timestamp=${timestamp}`);
        setLoading(false);
        console.log(respon)
        return;
      }

      const buildReq = {
        network: 'testnet',
        account: accountID,
        srcFileId: timestamp
      };
      const buildRes = await axios.post(COMPILER_API_ENDPOINT + '/arbitrum/build', buildReq);

      if (buildRes.status !== 201) {
        log.error(`build api fail. address=${address}, timestamp=${timestamp}`);
        setLoading(false);
        console.log(respon)
        return;
      }

      if (!buildRes.data.isSuccess) {
        log.error(`build result fail. address=${address}, timestamp=${timestamp}, errMsg=${respon.data.errMsg}`);
        setLoading(false);
        console.log(respon)
        return;
      }

      const res = await axios.request({
        method: 'GET',
        url: `${COMPILER_API_ENDPOINT}/s3Proxy`,
        params: {
          bucket: S3Path.bucket(),
          fileKey: S3Path.arbitrumOutKey(
            'arbitrum',
            'testnet',
            accountID, timestamp
          )
        },
        responseType: 'arraybuffer',
        responseEncoding: 'null',
      });

      console.log(res)
      const zip = await new JSZip().loadAsync(res.data);
      try {
        await client?.fileManager.mkdir('browser/' + compileTarget + '/out');
      } catch (e) {
        log.error(e);
        setLoading(false);
        return;
      }
    
      await Promise.all(
        Object.keys(zip.files).map(async (key) => {
            let content = (await zip.file(key)?.async('blob')) ?? new Blob();
            const arrayBuffer = await content.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`compiledModulesAndDeps=${buffer.toString('base64')}`);
            try {
              await client?.fileManager.writeFile(
                'browser/' + compileTarget + '/out/' + FileUtil.extractFilename(key),
                buffer.toString(),
              );
              setLoading(false);
              setCompiled(true)
              setDeployData(`${buffer.toString('base64')}`)
            } catch (e) {
              log.error(e);
              setLoading(false);
            }
        }),
      );
    } catch (e) {
      setLoading(false);
      log.error(e);
    }
  };

  const deploy = async () => {

    const hexByte = '0x7f0000000000000000000000000000000000000000000000000000000000002cf280602a6000396000f3eff0001b387eb311166c1c406233ec18917cb34608a89e8e1b6360015a772d1b962253172a4c231c1a176dbaa1041d7ca2e81d1ded6d2d9b5587be873b46636051ab080f2237f4d05a685807237a2ac44a07aa42b3a2bb65f023fc9f05e10c6c1bf9939cbcfe7fefd4ee9b19c7cf89944c58a9dd669c92d264b7405e40fa6abac45f9c8d546277090b084e81d0e7ac3f5a760975df7e6dee5dba43bca9ee0d66a9cfee379bbff22d4183164981488a44e0ffbf6f9a5f55dd9ee9cc6d8d3bc4bb3a24bf357a8fa58475b4869c79c45fc0ad9027c0964c01240700c0965b0cf3d83f08688b6c3bae5b8aa8d9ccbb889c86d80a0004aa18ba412781f7b4bb55d4ae385a3592990fa54b8b0226b801fbcddd14f5d296ae74b2adcc5fc69a890924e385e8edf92a173a7f80aad4406b94ad5180fed988e10aa8e8118a92b8e8d0ff5afeff6f859dbaa74ffa49cf7bc6fce06ea11006a3a13c5929143a1d3ab3f8953ef83f53add25fd5dd00b896c438b7678c8d00c8cd9cf3a14d02e2ffaa6ea1aa1a20ba1ba4d80d52330d4a1a81d418809a1dc3d9ed26a91d80e4ce033567a4b372679c9374ce6acfbad4b8976fb6e999303036dc30bd385c7fed87970991ae4c7c3cdaed6ffe90a6df763b99d8c5c8830091afef876ff53a3bd3badfde256a14110111335032d5943ad969d0853dde8bfc3ce86ecb1100eabe54a73c3b863ad153f2ea28845120716b60d6320f8444b4afaeef01ea88124529de309fe3650e64c3f36f49cca1307f5552c29cdb85d2c664c2bf63ff54e520f4c4270475024402b2fdf94999d8eaf9b630c4d702c81733d73a8a94285bc45f6f0845d27e94bcc1e54edeea7373230fb54966fb4724479beaff641560db52b3866bdb129a1bdc1d80215e2949ae2ad6769dba70956c6d3bbd361d60db0ede3dda57ecba4ade32cd8064d9f66599869749f38f14c52b1ebeb8f7660419249bc527e3dbef23f9576baf1cc1fac5ffe497ff2f5dffc4d7ea11976cdb4aff294b3e316844344591eac4505ea04e9ab49354a40f4e6eb76e3a52c7cf0463caebf6bf780f6a52b8bfcf63117980f0907935fa1f8a36ad34abc4ab9a3f0cca4f5f0479924524ad8bb509d57b4fb7e17e5f3fe6f7f67d7f903fc41fea0ff387fb23fcf17ed659cfd189fec0e07d6f8d7ff5fb7da71474d19ae13f7868ab7d6368ae833d3648a68a83a21c5c9c6b0d5eb9aed69c8b1cc277909465506c60a1eeabc6aba22fe85081db80620ea8b744aa8e71a74273e338eb0d290515fc0120c6a9afb95a1caf6a724b1456774b7f27c7fbae49ded2cf89a0f180ab31896f57313ed6ef3b67d7789f8ac576882b0e8b071f49a58ac81b5b49fb56032e26da4e2b2a6a1b5c9fa3c8cb5b96082d421e122a086c0ccbc132c809e704968eaed00e17790e17ce19e0e20e789e08deccce4c12dff3a36cd4cc76595cd8cc74a4527ce73951f3b004cda866975b1bda0a31a2eba42ed9814271a0ab0ad869bc84756f10c2da9e205a0e70b99601ac09383ef4ed060a913ec760bc6464c1695c5788aefe823ab14b05fb3aa972ab7d2bfcfd4afae6a31966680e9ed3092889244d12fabfef2eba71b1c595e21e2f1179f9c24ca44798c166abad6aad3c41b72a02d8e9652b2b71d2b5d468575c87ec8917cac8a06e3209f6a450ba9e6afc8b6ff66ea3e758e0d176b5186efb4c99e1632155783994037ed1acb2ee90bec9070fb7c239e7e00a06ed05a96b3d26753d8f6ed8028b85b5473669d4ad7931382751f1547c3b92042df80111b40ea59c6727baf71b43a6ad0881380655d8742806521c2fac28e111c75acc133b9f4611293806639a20f7cf4cc8f4673823d44ebd97472684c48afa12855572c65454ec9316f8e28da715f9e2ca31a542390ad93229cda6ae154ebd24e9f9d166b2450e695de043dc13d5af2ba22f93656278af769860df3d38b42c263087690efe200a993d0ce0264042d892225bea62983c1a2eab0043c9b05a20281e2639dbad4746249cf80d62763f42b8fb52b055737968590625d5110580b4b6643fa2d6e31681bc3382a25c9d1a5a145ca39ff0852752801b81cd9776ee0315656e5c38f4b40c34e73a997712d473e2f173b74edc665d5ceff7447a5ee1e925b8c0955a713db8c006caf2d2fcfe00b64720bb3e2b471286cb884a7f874a21799ba36105f685a433e4f7882419d1bd9f438576a8d045182042b5739eb6290a7465003b89ef8d15aef2bf9df12dbd5eee17ec4905e3d3b78ce605318fb40b2a4a74811e7c46bac9c70b57d2afdb0a5eea6ddc3d96ba51185d49fb16f4b4aa2b4bf2fb789ec23c43058b2b95fbcf281707763494342dd56543b8723a898c9c8effdf4976dccc64f058eceb3cd14ecaec56fa3cff285fb875b837b2be834379318db9c17f673f96e84d3d480619bcfeb58706157f58e5aa70f221294912cd49ba5e219730e998a077c20ddbfba4c1d9aa7d518a3a77faf00d3ecec83652ba4120a238f52d2833f360424cfc9c1b8e06d9d88d560210e1e2b4f2bf14694b39f59f1def3b088e795b269a1445661f5f2ea1878b838e4b87086d2202026740e1d4a754dd3768ab1b39bf39d6e014a797e6fb3793ddcd1bbf50e424bd74d489cecd70c4e1342905efdbc3ae252da1b85187f2df85f5ac422a6a3f5d3f2f5dcf4541a5a8a6d32e63aa7581f15ddd2bc5d231fcbf1147c56576bba2fe4e5546e4e9d49c34e554201eded04f241574b52e7091713c7ad33d92d64aa010f137381fbaf91229b4b9b41e0d7e6f49728c24ffbfa3c3e65312db184cbda1fdfc44dad8ebb15b72b3613d3ef0fe95de6796dcb37ff5fb7b874bfb41a19670992a475c7f0839467b24eda84f311b241d2f1635e164adf399ba89d198ace1f241a8cb24f6a6566a60ad94c29b298e83a49e58c8354b2b14ea422fe5dd0b113b227094d87363ed225adf66b9a36afcc27175fb3bf51b3db0e1a2e53d7507d0fa04804978ccb0fa29ac1ca9b7cb38444ed96b504a4572b6d8aa0085a1877b3d944fab90a45eedd3918c019645eb5953b1608fa02cfb6a2320b13f7c04f5e273ef72a7d0cb7e55cf49ba82b43777d048c9be318bcc47d19df9b483396c9071e4db3a42fd8e4c2d68d0d52830b06dd1e2b0c7fcde33e99b12be7196e6f1c1b3cce109c793821be909296f74a5eba9ea250019a9d37ccf523ed300e915267258736b86d7a569c55ed1f3941a3f48ac99d8d861a91960685aa933162ede192d8512aba422216634a05898411473214552d8029e843a7899524e071398fdf11b1ecad9b651f1f4b5291a5f13d8e9ba35b9cd6cce25552467fb78b3109478a1d55e376748d5e99a69fe5e6a8c2f97ec0ceba4c90613b2166ea73de55448afc851fe18b1b5d38c6e3d8776405276245b27d3d9364926da07f825462041879cb8d749b893341157d05c9bf6066605dd14562a3006d5ffc3d3d7528a5a430a33ac4d8735f2d678779ed9bb81ed93f0a3637fd4b5971abcedd77f2224525e1a566ddd457c1256914ffa2a123da62dbc99e4dfe61be178a10505410d269e36ad79d81d9445996481381fb04b19d5188b579e44a3f5a7a8494907eadea60ad7f03a1f78f97bd386e6c5e7d5b341ac9a3711399a7495c958ec1477fabde3286e1a8478c41c47990b683a4b4f03b2ef446e9889d1cf3d841985e3364c97bde49817d62cb7ca965b65cbe0a1b1f492e74f19475997ac4ac7008b8a2c7218559698ee649fdc3c28b9a041f32c568181799b41023aeb7facd6b8154b47d04a986faf1d6a9e1190599d23902f8d549e2c3d9677ed15c4e611c60893b4549a52e787fca1d57aa6a8f87cfc9f06676116bfe5c2414ac0ae40a7d1d01cf1ba08e16650bee0626851b446528b1661f699bece4a9a1fd78b24d716ba4d30360e6b4eb9c193119c61104e3ddba25b84ee760167ffa0fc62c30e1350ed9c0fed59454a14a71c4365d51ca914984c38f492f9b1968122ebb25c383c4f0ab108fc9ba59a80de93b18c84f14b50963a68a913425b70863cfc25212c69e2c77c85115e14f5fbf96985a5ed314ac90b6c532529d4539916a208048d4bfcd82e7ffbe0b6c53c60034e3eab7d90426f3392f5366a22e15e6fd5439720d9750309e3096db53d5227aecf941469e10c7be5de92b66a3dd1a0f7f09c8369b954af69ad19a8fd4b0a92b00127d2d3f16d6f65575eea541f5f12a4170fe71503925a5c8cdc23189aa5827895d7044cba85d991527d58301f57e6c748168548855ca10442bb36a451de6c9256df10fbe31bed986c5613636f98d6340e95dbf596429fabab99a4a94b5170bfbd58722c14c6a4ff8a36d3558fc05fd8525c23e7f658752ed2106c021813ceb34feecd0475c13594e49b46cf19c8daebb72b41bef8b6d7a7df6cc31894c71ab948b1525b8a46eb906d21ca4db0c58452265906793866b67ee802945b3d04de881c019392ef9191354e891280bf4c7005217493e9156db4e23c2c31c25a8b4e26b48042ebf86f0868abcd69209f77c3848d229e076e6518625938c5dc9f7dfee37660c43c6d10f433e645b9ddd9e98837c8dab1ac644cf74d69fb247ea017da6aa80d1f2177c55c2070cba11023b4dc5eab9220a91112c06a701e1b6c785a9a678e320ae4fb622c1110bf4d3452151855c54c9ba8520a3016b527d881ea6115d87776a5cb0230dd416be3d3ed3ca87d4bb518e98629639e45a9b51b6134f299a0142229ac0437e77962541c636845f3f4c5171054b165498a44867c9aeaa72dca8457d36e9fab5fe2bd7f33a1a3441910d8d92a64193f8c0486d5ea823905c9febebfb4c24f0e996f04c384ba92a02b8cefddb2963d15edaebe45336ec8c12cbb39046d5b49e1167cfc9b0c47c3a4105a123974244dabc8e71a6e24d6424cfbd84f33d10089b3f2fa7c8c1758eb2ffc9452d5a7659a9f27929f110db8d9a97703c1db624228617937c8740201bb415ac71701503b84a2a29047e1b751fb442a63647f8693b5d60a90dcaa81d8402ca0fed825f1138a4a4085658887f65dd3963d3aa2627baabb26a1a70ebd898c4889e2b3af96b132d22a87a84745a9e0c65a957d50579b4da720486e778af125a1d79cea7d58a66febf23e5999dea4f9a891123bedc68422fc7ff8189cfd7fa9c287c8b279d33a07bb92581cf26a0ea604c5ee654dda21b43b66b490ae8895a894503a0b21483c310e247ad4cd00968e1195435431edbc33b5af225986b988167bbc9bb982462f39270d33cdf46c84434d3388e97cd2ecd23d0776421e46c5d865724ddb5770e83b38f42314b91397426bb1166d3e49fd4e2abb3e15da966930e99eb241fc118cfa999e05ee5110f373df6062d907a693bef42fe847fa857854bb18ec9f27465dc73ffdaf65d13eaeaca8742bb97b3cbc59e79bb65701feafdaa41f882bd7ae502e824bd3fecbc885d70ba9118fd75c1948d88a3366e0f1fa4ce69c82b369da802b55cc27128adac8d07590c29a5e593682e0db99e25e1c9cbdc872b35e32f72bf8aa6d61710bbfd79e96110d99a05dd97899069a15e8ea0666033cbea64777b4d6224b9faf2534423334e9c181044882eda2dcdbb42e3b19acb1e3fea44a295edcb193d6c94c19f9039e23bc36f50261682bbf3157440f8a935349a32a039ef3bb565040ab7afc1587c67ad35a674d3091c6f100f56fb78ae333c5a419e9da5c29858596b64fa1d172ec271b200b64c36529ec0f79291b29f36fa4883d3c2fde6d8b6ab1b2a68dac71d89f7dae82da0feb493dc4f5e8f648ce15ebeb566c3c2e6d9bde4291e7b9dfd8ce0c33bcc121e7b3b299034d2dd770bf0315b0cdb6352e285822d9d232c36e397f204149a4b20355a1edf66d882a5a8c1c3f0c6de63dc3d9e45d73b934bbadeef27de863b37afaa718e2f753ebefc5b4ceb7e014583c8a88ef044985828fa2cb1a0e7682ffd14e0824dcdf9ec90ef6dc0d5c37923038011cf7784e0c057f0a2d013acdc5ebdd6a5a270088b386dfe07122c2a69bd674cf30404989004186b0a04fd1a165ef1b6eda66128cbbb8c524ebb67a130f4b487ac0c724cece4bc9f39230dce10a77916a0976b7323b717ee6889c4b9836566278427e502058c1ab2f0e30610683f47e971492ab4bce98d5f58e8bfd537f8d7d5d22f250f4a7fc9cc143f187ffeaa8f9479c04b656ef7a9d997f2fc273f42cdbcb073faa0793ed3ae2af9527531836c4190693c9ce35a54eb4ed71bd48ac71b4a3ed17f1d21d3f3e3eb9c701275c1feb4d9425f578102522e506f29e387d73425d7d5b2477fa7b48da718e415b0f1e27d2d3f400a857302e44c5e5538610c607f2d040650b662347ad581dbe15addc0436a4ef01585794ce80e7da098cd8eb79fe1da755e70ea7c2345268d8c6fa24c4c0749923144fdaa455245b06c4aa9336e36e5776701cdfdd989de33a89093295f86e6eacaa724f77b512953508b5319abb96b2d78938f180faa94c574a55585243d025d7a7447abc87d3faa6e0501634946dcd826cd40634b68861cb357b5148928b68b0df764d3ad38a6b795f323a97733c63a95f5450d119bba6f7c4db2f4e7ff18c736c4e34e37f6e549bc15467762f1be01fdf92e06ae590c24b29fbde14b8111331552047eee9d8af3ce4f48883ec54f47602243b78dae047bf2d416db3187681907fff44aca9f274bc34a713dcba71e5ecd1e5df359cfe2f7ee3781282374753f82e2fae0e6532a95fcfc075589c9ec3ae34238e3ec8d9c90f0e095fe74cc4430bf2f10c14f992314f8ca752f110d6cc3c6e3ed121e74e2f4027318120f19ee3f060aa044ea5903d464565c11e39b672726f4326c96aee8f22b42e886bdcbbb682e108b44b3ba44eb17046c11cb366c7e449e67eb9c5548ae01386d97e852883523f89e2cb2cc24e68b7566be8aaa6fa5f0d81a8351c7ebf5be1368d381aadb944f6de067189908dd896eb94a3b62528d51f865f196875cf05ea04c89f99bc5f2cdc110f9f7e43e8ce139b80e580b2f3342b2541b66e874b7b7920cfb7319ed0be374b611d041f13f36c38cbda62e95e3d38e144b89752e726803bc16d62bc10a95d6608ded4c06dba5aad78011c56a5a31091b4488f1813a2e2b401ac97bd479f91b216821249ff3a50f9ace8069c7cb2c08627abb7994e9559af1f2a4732139562f3dff020a56ba8fc40456965df5b046e6ec8f0982e5f23bce3066ee737676c3eb8695b102179c6469537761a07bbca8cb0af7539eaed87076c182ef1dcf53cb565f963efae9e4efaa519c1363355c5e6b3fd379b178fe52f259e0a631d119d43287c5e74bf15d0661bc48c4769ea13c35ef88e5fbc0f2596dac740ae930733a31550ead8b346197fc187c5b291104c83c855fd645a329efed6f4bb1f3c99b73037ab121482a0db56bda994cf5252d1a8eae590c51c03f84c13c57516109502b4ab9acbd2661c626c9865540348bd821a1b0694b256be14f97db35e1cdf04d5758f1b41df758b494bac84bc6ce2216f6b708e9c9d4febd3a7ff0ec8161f012fd285e75e37c96e4eaeec7df0afca77f5eba0de77bf51857dce3717bcacf7c82649eb3da90f7d6628a76504019fc5f9714aed11fa63e6dfddfae3145373a4025e9ee2cc549ad7ace0fbd821acb82f05f432df9d29d37d3267090563218c2e15e71cf59d50d1d98c5726cb3565fc1bcf87376ff21e3ab3ef4d8199acb8b4a29842ffb0da9e9945cd2475de72bfd8854a917efcbdadc9e92717af83ab662de54577e9213b3cb3dc48a45e3c44819dd5bebf93df94ee0175ba1073586f48b6f84b3a7c791a08758b2139ce82736868352a8117248ec18a109a6f14cfa7762a3bf6c7c06cf3fc8f847ad1bb4372f4c9319cbce223f7746e7ad44665bebef2a6755aeb03d90afb8aa77f5034d7d59a7391bdfd32d32137db108263bdf6b4026856c93fb08a1d420ae890cab388f374e186f284da4c4f0221fbee4838e7cf67e12b3e242434bdf532b6d07f7ef173f039a3dfab63f698ae3944d9a8c18b1b0a7cedaa7bea7e006a0ae9a498f20760fdbaf4ded6b42603cb1119f30d78a8bb187f0f8a33282cc5be278c838d1b00f8c1419c9e9a9f79966ce62a4322cd2ba786aed64c6249ab70710561c54a3d897c7747be02a522cbadaa4fdad52b8c45130876878d5f58b8c767c6fb8eadaaf4e9d3044fff088d961c5fb225cd99728a4d437821ff5cfea1c88af72d2ebe8ec1799e56e896af6612a343da3c36622215062cf7450736cbd2699d7fc19fc9e9ddfcde8229d17e02d5c6b2d15214e32832dcf7601cecf0b0a4f36c613111c1068715045257ef9fe3bbaecfda0c94ecd6952878d66f62a1ddddfc9450d21bf60c9442da0ec4c1288bf0058a732a8d0a7e067139faf020fb4190140ea685ad602ceda8253b02973c2bb00cc27eef397e1ac7d20e27c58fa580198f7a73b29c046799d8b1dc8527aecbed47e0462655eb0217f97134447b0552ec67e353fb001782c610a03104c80649603fcd06b6d83ae788ab88b2118301321876359f1cb5801fd5e2aa1657b5ee10c2016ced36aa876e2c0bb02f75ffa0494b4878b6c410e764e996583fed0735200479e9d1bd97a4b17fa23fd93ac2d37e64519775152af824227ef59eaacbe4fbfabc5f692baa5ab689d3d3650f3b4932e99cf389f800c7862e453a765a18fd8bb0aee9826056682a8977d00d4904a8ba781a37df9cbc810d5a496b25244274d3a9857a3287583f21dd3800ee9ac2a6113a68df50da4e64859829f48688bf76f7b27417129e28a4f611ac9d6a31218e1b70f5e8d05a57638ae93121cf3caf127b54299aeb2abdd9c38169065b10d8a938a2974ce47a071dcfb9c8213ad37beb12d93ab5562fdc27465b00d86559c0d046b220bf670752076c6f2a3b29a52c44853b54237808570e74cf5a17f2b6d96208b133db47937c778454eadc5b0e6dbc7dd8ac82737e69cce9a015df840dcea464145f9febbd003a1099cacf430c1d880e0b5510bc319a08d6624006b75889f15235a9afd791c89098f45dabefab4a5aeaac9eba913fc773b042461da56981587e879210ed4bf32bfc0593a602e843c1f62ad471d2cba12461f16ce7b24060f0c46405921f8668799778a2c152ce2c26d22424cf3b43e6ffc43bcd0d850958c495c2f043a1c9057508a2aeff67f301ffd896a64182719fb86f5b1b64a25c92fa48539a6a884b2b5955c325a673ade6c8de3b7a802c1c359fb96d80f9900f22facd0c94d1cda12d18d90d705515db423c1bf32974ab05c834bfb33cea6c0d7abf918c93c87b4b98a86bbcda07bfffb582a686b6f9c6d779d56e2bc5b791db49ed12c866ea6e8263ed2515726985a633c33651f1b656d1ccaaa9dd1d1c280b30f5a2356f809ddb16fbe5f5046d16b50cfd20c1e8174c99a56f141553b7c2034ec61c844e2120d78dc3fdbd38ae2b34679b65c5566673b34c8bfb04f2c049cdd6416a80410174e0ec4c0f0ebb15a23866d9506f4dcc9bbb28e77975964d17c9d5228706d5504d1528e94bcc73f2804a0afcde8933238c57934258b80c94b6ae1b690787fb54fed713442db5887cdcea309e095b5d5a66cd413f721b8a466ce690ec44ff50a90403a091e5bdc410420b920442f31331feccc463b127196dfbd02f06cead845381c07c9adc826010f16711013a2b1efe75efdd03ae7f7badd71a079d1d890b3eff7de7dbd2aff60746ae8d99b74ffb1c707ffad9339f1fb3f1cab563af262e7ce0a18f3cf9d6b9bf6f4edcd2fb5f1ffeeabfb5b7937d2fdd63bddd5f9a920a7c8a9589128765c7a04079bf8108a4652cd57cf69d793da9b48e7e880d6587b1ecbcc0408438e67eb74038ac534f6e46e69d6a3e0e845997017319d2ab51be3d227467aeffee5cd95e3f63f8110b861fde7b4487ff9d1be5effcbd4c929a3d36e065bfcaa794047146a58ec6b11fcaef572d830746813026c6b1f4575fa7a11ed0d4dee223b363eeb56cd2560e396e967e4d5291f873d78d0ee6cc17e4455a35288230cf2ee652230ad6da335969c058df03b8788303dc056688025f3f1c57e2fa5c1e0029d44caa0e10f2e9a7ef95aef8abe7e5b078f1210b277f028f9f526eaa3c27e9af20845ed0cbc634904aa279ce7bda666464b4584deeb2b0ad2a39b2f56988b8980bb2e9b8c2dc9f15a30aed2e45c9054cbbc80a3298e05760b1a7db45bd56e8d6af6979bf2b3ba2a083d1454481ab27849e93005bf3fead5f10722ef23d62749e9a14a88ec960d740d8521a6c97d18bbfaf00837f5f290f02a4e0f1182806b3493b7ff772670f90c9cda6c028e21f8779d1bf84ead2d9c1f9c4702d30a2a528e9e1c75df36ed5491a7d3e19a59f33ad83ba3a9aa806d2e562bfb1ee390ac00fe8149f90cac514aefde40f1edbc3f60e4c886abe8fe85633cccd87794d7afbb05a5df70c92e1aa91c41d4b62122f5d2109726494dfe635c1ddfbe824dccde6f0fda58fb480bf535ad18766dd05b438b6d019949da61bfad8230f5f30eaa554adbbeab121a49a34154ae317d84cf7b634c372d52115e872879a280df1824f3900edd02b7dd24c80c89f2e9d4643b88f6f466069e05da35a809d009848c3ba0c90ce8c9de515eb1e651aa292af3cc0fc976559a04d0b13ca9f11c9edf25824552bcb8fa17d48c908da5c278d9f7d939db7c6a088d1d2956109a65945215624061e454e1765da60d3ca3cc4b60b06fe3cdac38b301f77e0a03cdf17a3a78ab15446c24a8d63af68cb245ce5fce0833aa3b5543075f5096159f291ce89ae852b1542c96fc63b676154d7a7c84b5ccfafa7279da524923ca75223c69418a9cf18d71e1baf4242af0a4a3067d78e3c7805418261dfc13cfc62b1501603ee3fb3263ae4aa4dcbcdd92765610cbb1ccd8732bb5715edfe53f64b869220dbf33ca2e6cd39fb888a4f711d0eba18fe85bfd2ebc3d639d040bafef05afa1ea4127efa4a29255989bf72fda973961e8cff4f952c6a82b5eda739f5b0285b0f489bc61e90768d713d7cc2786b8d92f7e119d6498469486e6e35dfc68cff123c1b0b00081b0f40c7c61f80168c735465857639511c55dd8bebdc4a492f77a6bbeefa737ca40890ce03d29c8907247fa22cd18c2031eaa8b2958c6f2b0e7c17c82da7138c45b5281128c13d85ba10afee28ef57b749ae7b4563a685c3b465ee11628f314a2517da7f93351fe2aa2b3c98e733d74ac8cc6275c5845aaf64233790eca168b36bdd14c38dddbe2706250f29a3e92a39df6eb4ab5869d66b2006c4b5f1b0863ced804d890614e4b67720a8d4e5fddeeea56e5b6d18e518edc55e84047a726fec5ff534168e7e0a5d30f5e5e307da8c2c534bf224d5a86877f0dcfbb06eb36cf066986f8fe0df371fa389aea672932ebd7e445b9a3c61d896dea82e7ac8bf9420c90a994768b29563833300c8a75c07368d65dd73bd5450715a672479b07742da01051e4c349640afdb8858398a8027585ae7f6aa0676550ae404dc73cd2749e14321e0e79ec48e8e9a86f4916a7118793920a308da52e85a5fbb523b135704b532407db363c3a40d4cba2a06d8de726fd38ffd00b31155a228a9c1eb9614b29c9f4cd11a2c3d258f4e6e33d423a8cc75c243b63ff30b9b28ba5065f6ef016f08ce87a01b58dd6e597d91751c2afc19b5516533d016c571a0e665966920d68acb046fc4a2985dcae4b371eda27cc37d20822bbc579e91498d6a0e62eea0995622acf379806acb1a091eb24c25f4f0f1f62198b0df73934ad391c58199e92df9618bdb48a6007d308781c72cdef55bd2819f01916471dc96bcd727271ee14f3cfcd0d455efccf1b378e9bc5aa85237948c98d3324d1503ae6b817b72500c14308db9f3185358ece665d93cb413db52e4aaa4719940c51298d1fd29368a527f2790ba147a1a6c10fdaacf47d7a411935a6aa9c722f142490eb4d7788a51e13006b5edd92faee5cb922c17bfce0a190f046ae481cfa52c2ed02e17548157833509c9d926a90a5bb5209b2e15bbc9a7d899639cd425ef38179cdb9ad9651a9bd40eda0e72b777c1ab8d3f75f25c97c5a93875a9feab15770ad611ed0a9a35200442edae8f4dd385c051b6f86ce0fd436e16bb6297eb6cdefc826625702d15b06cf2d8af934d7fcc5a216d865e40e6c48c59f0a56f34cfa7bfc225572b0aa37236c5acf2f889997b801827d46eebfce73977869f19aa468e600ffd72ab9425d270e5d890147e3af925e58178e20ed5a6764f299d71dd8e6e4b833b846d5ae6e4b656c18c7c73b38b91ed3710b18ba7ea549daaf3eee462db9baf69b1d9b98b9c3239e5c3e22b858c20f77618d12a8226770cca73b8ba42b9e9a6f2a3c895f89b04c966d7ae45f31b66318b4a79acc4ba08490257a8764c6fad01be55b1a871ee9dd2d3c574dba9282268fce2b0c4c67f25ede42c1944456f0ed1dd350fa83aa4695ff4295530e91195e177be989b99483e7cee2003c359a47decb5d306f78bb3599c8b37a7d189633760a72321359fe5816f1866b88073eb2a080099f11cd71860f7fcfdc4ed5c21e16cf201347131f16462ee5e3c5dbdfbf6d4c8f7bbe6064869dd7cc61856ac93835937f1be2bd58e52e7158fde320e067cce46f854683363fcfcd8ca561b286c85bff22a95a2cc1adb6077336f3d603be3d071f54a4c4155776f4d457d452a787764c071498ba2a43d90f4fe1c12d3e5dadd208925dd9278278b18ec45e661b0bb9c795d0548ef0dd87f4384fee5000bb3c2684e395c022a7cfc42ada588b61f99c1b12fe4f5b07ea3ae84bc1e4103274fbf1fb64e70ebc6d7fd11879ede0e1f23f5c473cc297c5d8ff3f8c59e83ceb5c0cb32492d6949c40115d3c21357c71a572e238498f2abe4fab21811b745433fad5c941587500a2a9268266360453e4e502f76c23a263e98fa934100b74531d6203107f053715d5fa250597222c1910d3445c0e1d8a5bb32962a2ff57c6a70271ed4e28e3eefe0b53ec72336c16197877a0c81f2c329a3ec3341076ed16c5b92579d6b92812c6735c739550924dd5206f304d4a2b4be08b9ba7af4746265099f24a2d8489e5f01271055473185d15894685ddb5d9481200861ae52b59d895879a51366df4f06c335d4322dee2f163505f190a9bae3ae8ba30540331699164d4bcede4f03fc61c33a595714c0acc515e7cbbe18022e247ef787ffa7b062c4c84fff7562deb93bca508b09b2dc3704f82ad86e614943296cbe582657c9dce7110957a280ce75b1ea9d20f78b6acb0696b1f841d260eaa93c7bda7865c70b9fd45553ad2559a5511daf6cfb225790f47fb670bcfd95b3737f9fe8cff44b28a51d201f02c12d087b67e12ea109e082d4a24893bdaec3fcaaaeb9287a216f4f3a52c12415040f7552fe934cc5d21bc7964659b56a2c354f3d9fa6d7ec93ae5562e855f8c8ba80fe75bc3618b9df6b413072bab3db773284ea352c628f0af2595565599e128ac209373542c2da14bc996e32b1bc0871fc6b72d01d8ed6602a209cdeac1e0edd249afd972c2f8bc56684edc888f2d196f350354bb5ff8a86ad4639f6333d7a4e6623a238fd20d5b642baaa6e5c4d53ba4ba0adf74c749b68dab8f774b6097adccc4b11c7bf48a7879f6e166da5ca42aad71e21ff7dd65741221689e73a6f0f29b08b95d91d714756ae5aab6b10b4a3b17a400a79c3a8a1676a698bc46877d6c3c4172733135b6f10601559c52a56f16261fb171f0ec6bb04a7050561173c5ff7861183489815a5b8fc4640503f36b5d5552d1914e6207d5f4a405391bfbcf950aaf772dc6fd3180d640c70f020c371297cbceae7998396d77470f04102c8f625cb6849595f61a1a43a20f9b158ced060926229f879924249532e9e2f0ee68cdfa8813ce27e6264492593ed0282f9b8888d46584ec4f23dce4bb08466ed3bbe9c4403ab28406502ebc65742122a8bb15c07e5b398e7dac91bc2d994b7459f74d4da4163233ac937f0571b14284c5309b826f2ad7ed6548f42c6b85fe6e1eae8dfa7cbdec872bd64a0831199dc84ead6aa75b80d384a0da8669481b671e64db32173240bea402768dcdbf62f8fa5084cb4cfbb73ba2cfd8f9700e50d6a4002d326a8daf75895b8c68bf3e6be05ed58d997736fb91c6fad1d1e716255a0bb099cac4feb3bba35d0029eb3b724614bdd2519056047624e76e606e1b3de700b0bb6a299f9e64090e8466aa2f22f36f332847027e482f90e4b388adf5058d43339fcf30589882e7d07415a45c657486ca127caea8da8650e7413692839dae2be95b87231404156374587398baa85eca2ed287aa5886dee23499784e45d0fbb78d85a286a0082c88be9ba6d5ca1cd924610040c53759db2b5d785a8b50e396bf104ecec01340a7aed40271bc5526283c3b140f274e6890a8e0b19c840f43dd575b3a26bd120de1a2b7d8b7bd2535a89cca01a0a1615c3e298e98fd3bccad1f6d86dd75b639b4f3dba9e64f036d87e60d076bc3e0ef28325bcc00456e95e1174f516d741d884da6a846ddb2cd8e430c049c5a32ac07c4139b1931171400f4a2d308fcf747021ec3af8b6c35ee5a6f0796744cde0e1a15c9420cc50ba870812581ab02b019589638444e390b3820a37c77cf992412f860186ad87390f4bd12d7c688a1a545492cd2ccc28854d469e155b0cb9adebdb00db949c9e5013ad2dcadd6bb2bd4199966f32527838544207e259e775c664d7cd6ddac6acf9da41173e2af3558d1135465aa357f37e71048082c9e6f2b662b556d132a3dbd63e82538f0e78c7f8e052edfbe3704b298b87661ed5b5d4b503ec29c4716e10af080b81c41c125762c2e8f49d46ee207efc5a9d199b1f295f9c6bac9c15e4e24aeeac24e651a34ac9b6b3ed51c0a71f73e97d60bba149febbca166c0f7319d8a7a581929164401b2904fec4cb51534df6d5a3a7d57257d35db52bc58a6929bde52f1d4d639d8fbeff1075e02e9ed73d99b5ef5903d89938f5b41960ade9beb5c9f654c831a52a20473545aefc36f2f8992890e6a7020cee01e40378c067cf95966034524621fffde3fd20d5ae7ccc7c0910567462a2febd58106aab52b607cb658685323e0bceedd66dd6cf8461958cdcef5882554966693774f4c975c1883486d60b93a3ea958558ce68b84c8ca308d27d49edc39d821f43d4d5b6b8160b0249ab2840fd3efdd51378575933a6ff0dd8bf87d71557cb9073abd1e18bf5c6fef7043e34b5af0110562824cd05e34f244ace1282bd6fa9e6d472150680df7b016d007c5401af11acdaf8c199f5d21ae9d3a2d261c93f05335402309d11f4498cef0cc6d703e1bb4e54be2b90b66131404d6f2031b612eb82cb8376a8fc9f027eeb0d3c0be097997528a57b959e41a9339dc7c623435a17ff1c14f2895fdac62482f4694c5d68ceb7d8303e1feceb25af7d1d4e9b004d0be2ddc29c3ebd7200b3b4d673ccbbcec361d4a7bddd0fc02e2e8b35b23e23578c08e5e9099eca4e4a18a5f228a0fa6ae59dedd6cf67649da1fabe3a39f7f9dab19850e3d15ad9d10f568d6a8c3dff1d3d300f281ca773a6a19de5c4b510fb0c0201d326703d46f405dec27681158c166eb358112bdea9646cbd731d7e1e2e82443f9b7ccb8d15a15a61769905daebdd7a0a45ae00a5e5fd5869b4ab5f1e9b0e184ae1b199b17f1ce67c4baf1210098bbb066292d7f9d1667f3b8a5e12fb08f73bf63234a33c7dab3d59192bf4f954ab9c39ac8235619a291665b15653fb1769a3401902dfbb747d9742ee7f97e3656f6b2c483e278e784388bb0f994df1bb8eeafff6075ead2360d46d1f6a3f37fc3dd486fee685c3763503eadd48f82ad62e205868acdac0d600e831e0b96d9b19ad3ab3e6a7ef0ef8b90c8d553e13a32dfa80b564ad58ebeb1960ceda8bb7e76e747b800fd7ffbdeafbe7f7ef3f7c00034230826271d8fda3f3f87f8aa3f1643a3bc74f70488a66582e4f5fd08892aca85a9dbfe1312ddb71bdbefc20134671926673fd45a7aceaa6edf6f62f7696abf566bbbb77ff70733c9d2fd783cf3c412dcc65d5ac4de9f701a3d1b115bad5ec75d24f4156e1efaae125af0c49e99f505db1029ce9df269430885589f0b30c3f48a7d12936aac3083abb4c4c3e16dc6a41588491cfaab8da2c78f4eac0186a7ce4430df52fa36c5de9b7f855334843246992240df1c72364db8cbc0458bd261f'

    const newContract = new web3.eth.Contract(
      JSON.parse(JSON.stringify(abi))
    );
    
    // const parms: string[] = getArguments(constructor, args);

    const rawTx = {
      from: '0x106bed81d010a24ad17d918eb0337da879ecdc51',
      data: newContract
        .deploy({
          data: hexByte,
          arguments: [],
        })
        .encodeABI(),
    };

    const hash = await dapp.request('ethereum', {
      method: 'dapp:signAndSendTransaction',
      params: [rawTx],
    });

    const receipt = await waitGetTxReceipt(hash[0]);

    console.log(receipt)

    if ((receipt as any).contractAddress) {
      setAddress((receipt as any).contractAddress);
      addNewContract({
        name: contractName,
        address: (receipt as any).contractAddress,
        abi: getFunctions(abi),
      });
      
    }
  }

  function getFunctions(abiJson: any) {
    const temp = [] as any;
    abiJson.forEach((element: any) => {
      if (element.type === 'function') {
        temp.push(element);
      }
    });
    return temp;
  }

  async function waitGetTxReceipt(hash: string) {
    if (!web3) {
      throw new Error('Web3 object is undefined');
    }
    let count = 0;
    return new Promise(function (resolve, reject) {
      const id = setInterval(async function () {
        count += 1;
        const receipt = await web3.eth.getTransactionReceipt(hash);
        if (receipt) {
          clearInterval(id);
          resolve(receipt);
        }
        if (count > 3) {
          clearInterval(id);
          reject(new Error(`Waiting for transaction ${hash} timed out!`));
        }
      }, 4000);
    });
  }

  const wrappedCompile = (blob: Blob) => wrapPromise(sendCompileReq(blob), client);
  const wrappedProve = (blob: Blob) => {};

  const getExtensionOfFilename = (filename: string) => {
    const _fileLen = filename.length;
    const _lastDot = filename.lastIndexOf('.');
    return filename.substring(_lastDot, _fileLen).toLowerCase();
  };

  const getAccountModulesFromAccount = async (account: string, chainId: string) => {
    try {
      const accountModules = await getAccountModules(account, chainId);
      log.info('@@@ accountModules', accountModules);
      if (isEmptyList(accountModules)) {
        setModules([]);
        setTargetModule('');
        setMoveFunction(undefined);
        setEntryEstimatedGas(undefined);
        setEntryGasUnitPrice('0');
        setEntryMaxGasAmount('0');
        return;
      }
      setModules(accountModules);
      const firstAccountModule = accountModules[0];
      setTargetModule(firstAccountModule.abi!.name);
      setMoveFunction(firstAccountModule.abi!.exposed_functions[0]);
    } catch (e) {
      log.error(e);
      client.terminal.log({ type: 'error', value: 'Cannot get account module error' });
    }
  };

  const getContractAtAddress = async () => {
    sendCustomEvent('at_address', {
      event_category: 'aptos',
      method: 'at_address',
    });
    setDeployedContract(atAddress);
    getAccountModulesFromAccount(atAddress, dapp.networks.ethereum.chain);

    const moveResources = await getAccountResources(atAddress, dapp.networks.ethereum.chain);
    log.info(`@@@ moveResources`, moveResources);
    setAccountResources([...moveResources]);
    if (isNotEmptyList(moveResources)) {
      setTargetResource(moveResources[0].type);
    } else {
      setTargetResource('');
    }
    setParameters([]);
  };

  const setModuleAndABI = (e: any) => {
    setTargetModule(e.target.value);
    if (modules.length) {
      modules.map((mod, idx) => {
        if (mod.abi?.name === e.target.value) {
          setMoveFunction(mod.abi?.exposed_functions[0]);
          setParameters([]);
        }
      });
    }
  };

  const handleFunction = (e: any) => {
    setParameters([]);
    setGenericParameters([]);
    setMoveFunction(undefined);
    setEntryEstimatedGas(undefined);
    setEntryGasUnitPrice('0');
    setEntryMaxGasAmount('0');

    const module = modules.find((m) => m.abi?.name === targetModule);
    if (!module) {
      return;
    }

    const matchFunc = module.abi?.exposed_functions.find((f) => {
      return f.name === e.target.value;
    });
    if (!matchFunc) {
      return;
    }
    setMoveFunction(matchFunc);
  };

  const onChangeResource = (e: any) => {
    const resourceType = e.target.value;
    log.info('###', resourceType);
    setTargetResource(resourceType);
  };

  const queryResource = async () => {
    const resources = await getAccountResources(deployedContract, dapp.networks.ethereum.chain);
    log.info(`targetResource`, targetResource);
    log.info(`deployedContract`, deployedContract);
    log.info(`resources`, resources);
    const selectedResource = resources.find((r) => r.type === targetResource);
    if (!selectedResource) {
      await client.terminal.log({
        type: 'error',
        value: `Resource Not Found For Type ${targetResource}`,
      });
      return;
    }

    await client.terminal.log({
      type: 'info',
      value: `\n${targetResource}\n${JSON.stringify(selectedResource.data, null, 2)}\n`,
    });
  };

  const view = async () => {
    console.log(parameters);

    const view = await viewFunction(
      deployedContract,
      targetModule,
      moveFunction?.name || '',
      dapp.networks.ethereum.chain,
      genericParameters, // typeArgs
      parameters,
    );

    log.debug(view);
    if (view.error) {
      await client.terminal.log({
        type: 'error',
        value: view.error.split('\\"').join(''),
      });
      return;
    }

    if (Array.isArray(view.result) && view.result.length === 1) {
      await client.terminal.log({
        type: 'info',
        value: `${JSON.stringify(view.result[0], null, 2)}`,
      });
      return;
    }

    await client.terminal.log({
      type: 'info',
      value: `${JSON.stringify(view.result, null, 2)}`,
    });
  };

  const prepareModules = async () => {
    const artifactPaths = await findArtifacts();

    setPackageName('');
    setCompileTimestamp('');
    setModuleWrappers([]);
    setMetaDataBase64('');
    setModuleBase64s([]);
    setFileNames([]);

    if (isEmptyList(artifactPaths)) {
      return [];
    }

    let metaData64 = '';
    let metaData: Buffer;
    let metaDataHex = '';
    let filenames: string[] = [];
    let moduleWrappers: ModuleWrapper[] = [];

    await Promise.all(
      artifactPaths.map(async (path) => {
        if (path.includes('package-metadata.bcs')) {
          metaData64 = await client?.fileManager.readFile('browser/' + path);
          metaDataHex = Buffer.from(metaData64, 'base64').toString('hex');
        }
      }),
    );
    metaData = Buffer.from(metaData64, 'base64');
    const packageNameLength = metaData[0];
    const packageName = metaData.slice(1, packageNameLength + 1).toString();

    await Promise.all(
      artifactPaths.map(async (path) => {
        if (getExtensionOfFilename(path) === '.mv') {
          let moduleBase64 = await client?.fileManager.readFile('browser/' + path);
          if (moduleBase64) {
            const moduleName = Buffer.from(
              FileUtil.extractFilenameWithoutExtension(path),
            ).toString();
            const moduleNameHex = Buffer.from(
              FileUtil.extractFilenameWithoutExtension(path),
            ).toString('hex');
            const order = metaDataHex.indexOf(moduleNameHex);

            moduleWrappers.push({
              packageName: packageName,
              path: path,
              module: moduleBase64,
              moduleName: moduleName,
              moduleNameHex: moduleNameHex,
              order: order,
            });
          }
          filenames.push(path);
        }
      }),
    );

    moduleWrappers = _.orderBy(moduleWrappers, (mw) => mw.order);
    log.debug('@@@ moduleWrappers', moduleWrappers);

    setPackageName(packageName);
    setFileNames([...filenames]);
    setModuleWrappers([...moduleWrappers]);
    setModuleBase64s([...moduleWrappers.map((m) => m.module)]);
    setMetaDataBase64(metaData64);

    return filenames;
  };

  const requestCompile = async () => {
    if (loading) {
      await client.terminal.log({ value: 'Server is working...', type: 'log' });
      return;
    }

    setEstimatedGas(undefined);
    setGasUnitPrice('0');
    setMaxGasAmount('0');

    // const moduleFiles = await prepareModules();
    // if (isNotEmptyList(moduleFiles)) {
    //   await client.terminal.log({
    //     type: 'error',
    //     value:
    //       "If you want to run a new compilation, delete the 'out' directory and click the Compile button again.",
    //   });
    //   return;
    // }
    const removeArtifacts = async () => {
      log.info(`removeArtifacts ${'browser/' + compileTarget + '/out'}`);
      try {
        await client?.fileManager.remove('browser/' + compileTarget + '/out');
        setPackageName('');
        setCompileTimestamp('');
        setModuleWrappers([]);
        setMetaDataBase64('');
        setModuleBase64s([]);
        setFileNames([]);
      } catch (e) {
        log.info(`no out folder`);
      }
    };

    await removeArtifacts();

    const projFiles = await FileUtil.allFilesForBrowser(client, compileTarget);
    log.info(`@@@ compile projFiles`, projFiles);
    if (isEmptyList(projFiles)) {
      return;
    }

    const existsOutFolder = projFiles.find((f) => f.path.startsWith(`${compileTarget}/out`));
    if (existsOutFolder) {
      await client.terminal.log({
        type: 'error',
        value:
          "If you want to run a new compilation, delete the 'out' directory and click the Compile button again.",
      });
      return;
    }

    const blob = await generateZip(projFiles);
    if (!blob) {
      return;
    }

    await wrappedCompile(blob);
  };

  return (
    <>
      <div className="d-grid gap-2">
        <Button
          variant="primary"
          disabled={accountID === '' || proveLoading || loading}
          onClick={async () => {
            await wrappedRequestCompile();
          }}
          className="btn btn-primary btn-block d-block w-100 text-break remixui_disabled mb-1 mt-3"
          // onClick={setSchemaObj}
        >
          <FaSyncAlt className={loading ? 'fa-spin' : ''} />
          <span> Compile</span>
        </Button>
        {
          compiled ? 
          <>
          <Button
            variant="warning"
            disabled={accountID === '' || proveLoading || loading}
            onClick={deploy}
            className="btn btn-primary btn-block d-block w-100 text-break remixui_disabled mb-1 mt-3"
          >
            <span> Deploy</span>
          </Button>

          <Button
            variant="warning"
            disabled={accountID === '' || proveLoading || loading}
            onClick={async () => {
              ;
            }}
            className="btn btn-primary btn-block d-block w-100 text-break remixui_disabled mb-1 mt-3"
          >
            <span> Activate</span>
          </Button>
          </> : false
        }
        
        {fileNames.map((filename, i) => (
          <small key={`ethereum-module-file-${i}`}>
            {filename}
            {i < filename.length - 1 ? <br /> : false}
          </small>
        ))}

        {compileError && (
          <Alert
            variant="danger"
            className="mt-3"
            style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
          >
            <AlertCloseButton onClick={handleAlertClose} />
            {compileError}
          </Alert>
        )}
      </div>
      <hr />
      {metaData64 ? (
        <div style={{ marginTop: '-1.5em' }}>
          <Form.Group style={mt8}>
            <Form.Text className="text-muted" style={mb4}>
              <small>Gas Unit Price</small>
            </Form.Text>
            <InputGroup>
              <Form.Control
                type="number"
                placeholder="0"
                size="sm"
                onChange={setGasUnitPriceValue}
                value={gasUnitPrice}
              />
            </InputGroup>
          </Form.Group>
          <Form.Group style={mt8}>
            <Form.Text className="text-muted" style={mb4}>
              <small>
                Max Gas Amount
                {estimatedGas ? (
                  <span style={{ fontWeight: 'bolder', fontSize: '1.1em' }}>
                    {' '}
                    ( Estimated Gas {estimatedGas}. If the transaction fails, try again with a
                    higher gas fee. )
                  </span>
                ) : undefined}
              </small>
            </Form.Text>
            <InputGroup>
              <Form.Control
                type="number"
                placeholder="0"
                size="sm"
                onChange={setMaxGasAmountValue}
                value={maxGasAmount}
              />
            </InputGroup>
          </Form.Group>
          <Deploy
            wallet={'Dsrv'}
            accountID={accountID}
            compileTimestamp={compileTimestamp}
            packageName={packageName}
            moduleWrappers={moduleWrappers}
            metaData64={metaData64}
            moduleBase64s={moduleBase64s}
            dapp={dapp}
            client={client}
            setDeployedContract={setDeployedContract}
            setAtAddress={setAtAddress}
            setAccountResources={setAccountResources}
            setTargetResource={setTargetResource}
            setParameters={setParameters}
            getAccountModulesFromAccount={getAccountModulesFromAccount}
            estimatedGas={estimatedGas}
            setEstimatedGas={setEstimatedGas}
            gasUnitPrice={gasUnitPrice}
            setGasUnitPrice={setGasUnitPrice}
            maxGasAmount={maxGasAmount}
            setMaxGasAmount={setMaxGasAmount}
          />
        </div>
      ) : (
        <p className="text-center" style={{ marginTop: '0px !important', marginBottom: '3px' }}>
        </p>
      )}
      <p className="text-center" style={{ marginTop: '5px !important', marginBottom: '5px' }}>
      </p>
      <Form.Group>
        <InputGroup>
          <Form.Control
            type="text"
            placeholder="account"
            size="sm"
            onChange={(e) => {
              setAtAddress(e.target.value.trim());
            }}
            value={atAddress}
          />
          <OverlayTrigger
            placement="left"
            overlay={<Tooltip id="overlay-ataddresss">Use deployed Contract account</Tooltip>}
          >
            <Button
              variant="info"
              size="sm"
              disabled={accountID === '' || isProgress}
              onClick={getContractAtAddress}
            >
              <small>At Address</small>
            </Button>
          </OverlayTrigger>
        </InputGroup>
      </Form.Group>
      <hr />

      {atAddress || deployedContract ? (
        <Form.Group>
          <Form.Text className="text-muted" style={mb4}>
            <span style={mr6}>Deployed Contract</span>
            <span>{shortenHexString(deployedContract, 6, 6)}</span>
            <OverlayTrigger placement="top" overlay={<Tooltip>{copyMsg}</Tooltip>}>
              <Button
                variant="link"
                size="sm"
                className="mt-0 pt-0"
                onClick={() => {
                  copy(deployedContract);
                  setCopyMsg('Copied');
                }}
                onMouseLeave={() => {
                  setTimeout(() => setCopyMsg('Copy'), 100);
                }}
              >
                <i className="far fa-copy" />
              </Button>
            </OverlayTrigger>
          </Form.Text>
          <Form.Text className="text-muted" style={mb4}>
            <small>Resources</small>
          </Form.Text>
          <InputGroup>
            <Form.Control
              style={{ width: '80%', marginBottom: '10px' }}
              className="custom-select"
              as="select"
              value={targetResource}
              onChange={onChangeResource}
            >
              {accountResources.map((accountResource, idx) => {
                return (
                  <option value={accountResource.type} key={`accountResources-${idx}`}>
                    {accountResource.type}
                  </option>
                );
              })}
            </Form.Control>
          </InputGroup>
          <Button
            style={{ marginTop: '10px', minWidth: '70px' }}
            variant="warning"
            size="sm"
            onClick={queryResource}
          >
            <small>Query Resource</small>
          </Button>
        </Form.Group>
      ) : (
        false
      )}

      {deployData && Object.keys(abi).length ? (
        <>
         <div style={{ textAlign: 'right', marginBottom: '3px', fontSize: '10.5px' }}>
          {address+ '  '}
          <i
            className="far fa-copy"
            onClick={() => {
              copy(JSON.stringify(address, null, 4));
            }}
          />
        </div>
        <div style={{ textAlign: 'right', marginBottom: '3px', fontSize: '11px' }}>
          {'ABI   '}
          <i
            className="far fa-copy"
            onClick={() => {
              copy(JSON.stringify(abi, null, 4));
            }}
          />
        </div>
        <SmartContracts
        dapp={dapp}
        account={accountID}
        contracts={[{
          name: 'counter',
          address,
          abi
        }]}
        client={client}
        web3={web3}
      />
        </>
      ) : (
        false
      )}

     



      {modules.length > 0 ? (
        <>
          <Form.Group>
            <Form.Text className="text-muted" style={mb4}>
              <small>Modules</small>
            </Form.Text>
            <InputGroup>
              <Form.Control
                className="custom-select"
                as="select"
                value={targetModule}
                onChange={setModuleAndABI}
              >
                {modules.map((mod, idx) => {
                  return (
                    <option value={mod.abi?.name} key={idx + 1}>
                      {mod.abi?.name}
                    </option>
                  );
                })}
              </Form.Control>
            </InputGroup>
          </Form.Group>
          <Form.Group>
            <Form.Text className="text-muted" style={mb4}>
              <small>Functions</small>
            </Form.Text>
            <Form.Control
              style={{ marginBottom: '10px' }}
              className="custom-select"
              as="select"
              value={moveFunction?.name}
              onChange={handleFunction}
            >
              {modules.map((mod, idx) => {
                if (mod.abi?.name === targetModule) {
                  return mod.abi.exposed_functions.map((func: any, idx: any) => {
                    return (
                      <option value={func.name} key={idx}>
                        {func.name}
                      </option>
                    );
                  });
                }
              })}
            </Form.Control>
          </Form.Group>
          {moveFunction ? (
            <Form.Group>
              <InputGroup>
                <Parameters
                  func={moveFunction}
                  setGenericParameters={setGenericParameters}
                  setParameters={setParameters}
                />
                <div style={{ width: '100%' }}>
                  {moveFunction.is_entry ? (
                    <div>
                      {entryEstimatedGas ? (
                        <div>
                          <Form.Group style={mt8}>
                            <Form.Text className="text-muted" style={mb4}>
                              <small>Gas Unit Price</small>
                            </Form.Text>
                            <InputGroup>
                              <Form.Control
                                type="number"
                                placeholder="0"
                                size="sm"
                                onChange={setEntryGasUnitPriceValue}
                                value={entryGasUnitPrice}
                              />
                            </InputGroup>
                          </Form.Group>
                          <Form.Group style={mt8}>
                            <Form.Text className="text-muted" style={mb4}>
                              <small>
                                Max Gas Amount
                                {entryEstimatedGas ? (
                                  <span style={{ fontWeight: 'bolder', fontSize: '1.1em' }}>
                                    {' '}
                                    ( Estimated Gas {entryEstimatedGas}. If the transaction fails,
                                    try again with a higher gas fee. )
                                  </span>
                                ) : undefined}
                              </small>
                            </Form.Text>
                            <InputGroup>
                              <Form.Control
                                type="number"
                                placeholder="0"
                                size="sm"
                                onChange={setEntryMaxGasAmountValue}
                                value={entryMaxGasAmount}
                              />
                            </InputGroup>
                          </Form.Group>
                        </div>
                      ) : null}

                      <EntryButton
                        accountId={accountID}
                        dapp={dapp}
                        atAddress={atAddress}
                        targetModule={targetModule}
                        moveFunction={moveFunction}
                        genericParameters={genericParameters}
                        parameters={parameters}
                        entryEstimatedGas={entryEstimatedGas}
                        setEntryEstimatedGas={setEntryEstimatedGas}
                        entryGasUnitPrice={entryGasUnitPrice}
                        setEntryGasUnitPrice={setEntryGasUnitPrice}
                        entryMaxGasAmount={entryMaxGasAmount}
                        setEntryMaxGasAmount={setEntryMaxGasAmount}
                      />
                    </div>
                  ) : (
                    <div>
                      <Button
                        style={{ marginTop: '10px', minWidth: '70px' }}
                        variant="warning"
                        size="sm"
                        onClick={view}
                      >
                        <small>{moveFunction.name}</small>
                      </Button>
                    </div>
                  )}
                </div>
              </InputGroup>
              <hr />
            </Form.Group>
          ) : (
            false
          )}
        </>
      ) : (
        false
      )}
      
    </>
  );
};

const mb4 = {
  marginBottom: '4px',
};
const mr6 = {
  marginRight: '6px',
};

const mt8 = {
  marginTop: '8px',
};
