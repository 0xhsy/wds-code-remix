import { useState } from 'react';
import { SuiConnect } from './SuiConnect';
import { Project } from './Project';
import { Client } from '@remixproject/plugin';
import { Api } from '@remixproject/plugin-utils';
import { IRemixApi } from '@remixproject/plugin-api';
import { Connect as CommonConnect } from '../common/Connect';
import { ConnectButton } from '@mysten/dapp-kit';

import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui.js/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';

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

  const queryClient = new QueryClient();
  const networks = {
    devnet: { url: getFullnodeUrl('devnet') },
    mainnet: { url: getFullnodeUrl('mainnet') },
  };

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
      <QueryClientProvider client={queryClient}>
			<SuiClientProvider networks={networks} defaultNetwork="devnet">
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
          </WalletProvider></SuiClientProvider></QueryClientProvider>
      </div>
    </div>
  );
};
