import React, { Dispatch, useState } from 'react';
import { Button, Form } from 'react-bootstrap';
import Web3 from 'web3';
import { delay } from '../near/utils/waitForTransaction';
import { Activate } from './Activate';
import { InterfaceContract } from '../../utils/Types';
import { AbiItem } from 'web3-utils';
import axios from 'axios';
import { COMPILER_API_ENDPOINT } from '../../const/endpoint';
import { log } from '../../utils/logger';

export interface ArbitrumContractCreateDto {
  chainId: string;
  account: string;
  address: string;
  compileTimestamp: number;
  deployTimestamp: number;
  txHash: string;
  isSrcUploaded: boolean;
  status: string;
  cliVersion: string | null;
}

interface InterfaceProps {
  compileTarget: string;
  providerInstance: any;
  timestamp: string;
  client: any;
  deploymentTx: string;
  setDeploymentTx: Dispatch<React.SetStateAction<string>>;
  txHash: string;
  setTxHash: Dispatch<React.SetStateAction<string>>;
  account: string;
  providerNetwork: string;
  isReadyToActivate: boolean;
  dataFee: string;
  setContractAddr: Dispatch<React.SetStateAction<string>>;
  setContractName: Dispatch<React.SetStateAction<string>>;
  addNewContract: (contract: InterfaceContract) => void; // for SmartContracts
  contractAbiMap: Map<string, AbiItem[]>;
  setContractAbiMap: Dispatch<React.SetStateAction<Map<string, AbiItem[]>>>;
  setSelected: (select: InterfaceContract) => void; // for At Address
  uploadCodeChecked: boolean;
  isActivated: boolean;
  setIsActivated: Dispatch<React.SetStateAction<boolean>>;
}

export const Deploy: React.FunctionComponent<InterfaceProps> = ({
  compileTarget,
  providerInstance,
  timestamp,
  providerNetwork,
  deploymentTx,
  client,
  account,
  isReadyToActivate,
  dataFee,
  setContractAddr,
  setContractName,
  addNewContract,
  contractAbiMap,
  setContractAbiMap,
  setSelected,
  uploadCodeChecked,
  isActivated,
  setIsActivated,
}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [deployedContractAddress, setDeployedContractAddress] = useState<string>('');

  const onDeploy = async () => {
    setIsLoading(true);
    if (!providerInstance) {
      setIsLoading(false);
      return;
    }

    if (!deploymentTx) {
      setIsLoading(false);
      console.log(`No deploymentTx`);
    }

    console.log(`@@@ deploymentTx=${deploymentTx}`);

    let hash = '';
    try {
      hash = await providerInstance.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: account,
            data: `0x${deploymentTx}`,
          },
        ],
      });
      console.log(`@@@ deployment tx hash`, hash);
    } catch (e) {
      console.error(e);
      setIsLoading(false);
      return;
    }

    if (!hash) {
      setIsLoading(false);
      return;
    }

    const web3 = new Web3(providerInstance);
    const tx = await web3.eth.getTransaction(hash);
    console.log(`@@@ tx`, tx);
    client.terminal.log({
      type: 'info',
      value: '========================= deployment tx ===========================',
    });
    client.terminal.log({ type: 'info', value: JSON.stringify(tx, null, 2) });

    let txReceipt = await web3.eth.getTransactionReceipt(hash);

    console.log(`@@@ tx_receipt`, txReceipt);
    if (txReceipt === null) {
      for (let i = 0; i < 3; i++) {
        await delay(2_000);
        txReceipt = await web3.eth.getTransactionReceipt(hash);
        console.log(`@@@ tx_receipt`, txReceipt);
        if (txReceipt) {
          break;
        }
      }
    }

    if (!txReceipt) {
      client.terminal.log({
        type: 'error',
        value: `Failed to get deployment tx receipt for hash=${hash}`,
      });
      setIsLoading(false);
      return;
    }

    setDeployedContractAddress(txReceipt.contractAddress || '');
    if (txReceipt.contractAddress && txReceipt.status) {
      const abiStr = await client?.fileManager.readFile(
        'browser/' + compileTarget + '/output/abi.json',
      );
      const abiItems = JSON.parse(abiStr) as AbiItem[];
      setContractAbiMap((prevMap) => {
        const newMap = new Map(prevMap);
        newMap.set(txReceipt.contractAddress!.toLowerCase(), abiItems);
        return newMap;
      });

      const contract = new web3.eth.Contract(abiItems, txReceipt.contractAddress);
      let name;
      try {
        name = await contract.methods.name().call();
        setContractName(name);

        console.log('Contract Name:', name);
      } catch (error) {
        console.error('Error interacting with contract:', error);
      }

      if (!isReadyToActivate || isActivated) {
        setContractAddr(txReceipt.contractAddress || '');
        addNewContract({
          name: name,
          abi: abiItems,
          address: txReceipt.contractAddress,
        });
      }

      console.log(
        `@@@ add new contract name=${name}, address=${
          txReceipt.contractAddress
        }, abi=${JSON.stringify(abiItems, null, 2)}`,
      );

      let deploymentTimeStamp = 0;
      if (txReceipt.blockNumber) {
        const block = await web3.eth.getBlock(txReceipt.blockNumber);
        if (block) {
          deploymentTimeStamp = Number(block.timestamp) * 1000;
        }
      }

      const arbitrumContractCreateDto: ArbitrumContractCreateDto = {
        chainId: providerNetwork,
        account: account,
        address: txReceipt.contractAddress,
        compileTimestamp: Number(timestamp),
        deployTimestamp: deploymentTimeStamp || 0,
        txHash: hash,
        isSrcUploaded: uploadCodeChecked,
        status: txReceipt.status ? 'true' : 'false',
        cliVersion: null, // todo
      };
      log.info('arbitrumContractCreateDto', arbitrumContractCreateDto);

      try {
        const res = await axios.post(
          COMPILER_API_ENDPOINT + '/arbitrum/contracts',
          arbitrumContractCreateDto,
        );
        log.info(`put arbitrum/contracts api res`, res);
      } catch (e) {
        log.error(`put arbitrum/contracts api error`);
        console.error(e);
      }

      setIsLoading(false);
    }

    client.terminal.log({
      type: 'info',
      value: '====================== deployment tx receipt ======================',
    });
    client.terminal.log({ type: 'info', value: JSON.stringify(txReceipt, null, 2) });
  };

  return (
    <>
      <Form>
        <Button
          variant="primary"
          disabled={isLoading}
          onClick={onDeploy}
          className="btn btn-primary btn-block d-block w-100 text-break remixui_disabled mb-1 mt-3"
        >
          <span>Deploy</span>
        </Button>
        {deployedContractAddress ? (
          <div>
            <small>Contract {deployedContractAddress}</small>
          </div>
        ) : null}

        {deployedContractAddress && isReadyToActivate ? (
          <Activate
            providerInstance={providerInstance}
            providerNetwork={providerNetwork}
            contractAddr={deployedContractAddress}
            account={account}
            client={client}
            dataFee={dataFee}
            setContractAddr={setContractAddr}
            setContractName={setContractName}
            contractAbiMap={contractAbiMap}
            addNewContract={addNewContract}
            isActivated={isActivated}
            setIsActivated={setIsActivated}
          ></Activate>
        ) : null}
      </Form>
    </>
  );
};
