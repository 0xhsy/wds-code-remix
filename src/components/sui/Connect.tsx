import { useState } from 'react';
import { SuiConnect } from './SuiConnect';
import { Project } from './Project';
import { Client } from '@remixproject/plugin';
import { Api } from '@remixproject/plugin-utils';
import { IRemixApi } from '@remixproject/plugin-api';
import { Connect as CommonConnect } from '../common/Connect';

import { WalletProvider, ConnectButton } from '@suiet/wallet-kit';
import "@suiet/wallet-kit/style.css";

interface InterfaceProps {
  client: Client<Api, Readonly<IRemixApi>>;
}
interface InterfaceDapp {
  networks: any;
}

export const Connect: React.FunctionComponent<InterfaceProps> = ({ client }) => {
  const [wallet, setWallet] = useState('');
  const [account, setAccount] = useState('');
  const [dapp, setDapp] = useState<InterfaceDapp>();
  const [active, setActive] = useState<boolean>(true);

  return (
    <div>
      <CommonConnect
        client={client}
        active={active}
        setActive={setActive}
        chain={'sui'}
        setWallet={setWallet}
        wallet={wallet}
      />
      <div>
        <WalletProvider>
          <ConnectButton></ConnectButton>
          <SuiConnect
            active={active}
            account={account}
            setAccount={setAccount}
            setDapp={setDapp}
            client={client}
            setActive={setActive}
          />

          <Project wallet={wallet} account={account} dapp={dapp} client={client} />
        </WalletProvider>
      </div>
    </div>
  );
};
