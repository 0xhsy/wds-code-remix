import React, { useEffect, useState } from 'react';
import { Client } from '@remixproject/plugin';
import { Api } from '@remixproject/plugin-utils';
import { IRemixApi } from '@remixproject/plugin-api';
import { log } from '../../utils/logger';
import { useWallet } from '@suiet/wallet-kit';

interface InterfaceProps {
  active: boolean;
  setAccount: Function;
  account: string;
  setDapp: Function;
  client: Client<Api, Readonly<IRemixApi>>;
  setActive: Function;
}

export const SuiConnect: React.FunctionComponent<InterfaceProps> = ({
  client,
  active,
  account,
  setAccount,
  setDapp,
  setActive,
}) => {
  const [balance, setBalance] = useState<string>('');
  const [error, setError] = useState<String>('');
  const [network, setNetwork] = useState<string>('');
  
  const wallet = useWallet()
  
  // Establish a connection to the Sui blockchain on component mount
  useEffect(() => {

    const connect = async () => {
      try {
        if (wallet.address) {
          setAccount(wallet.address)
        } else {
          setAccount('');
          setBalance('');
        }
      } catch (e: any) {
        log.error(e);
        await client.terminal.log({ type: 'error', value: e?.message?.toString() });
      }
    };
    connect();
  }, [wallet.address]);

  return (
    <div style={mt40}>
      
    </div>
  );
};

const mb4 = {
  marginBottom: '4px',
};
const mt40 = {
  marginTop: '40px',
};
