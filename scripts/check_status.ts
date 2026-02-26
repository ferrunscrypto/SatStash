import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

const contracts: [string, string][] = [
  ['BankToken', 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl'],
  ['PiggyBank(new)', 'opt1sqpezzj9qh0ht0s2g03njppp4mxmuz0udycg0cudq'],
];

async function check() {
  const block = await provider.getBlockNumber();
  console.log('Block:', block);
  for (const [name, addr] of contracts) {
    try {
      const code = await (provider as any).getCode(addr, true);
      const isCode = code && code !== '0x' && code !== '0x0';
      console.log(`${name} (${addr}): ${isCode ? '✓ INDEXED' : '✗ not indexed'} len=${code?.length}`);
    } catch (e: unknown) {
      console.log(`${name}: ✗ error - ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

check().catch(console.error);
