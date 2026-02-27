import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

const contracts: [string, string][] = [
  ['BankToken', 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl'],
  ['PiggyBank(latest)', 'opt1sqq5yhl5n4fjjygrz00xldy9x8w4rskdlm5g8vf3d'],
  ['SatStashPool', 'opt1sqq5enjyr2x2y6ujs2dsdzvwcdrj3ypeeycvd4slz'],
];

async function check() {
  const block = await provider.getBlockNumber();
  console.log('Block:', block);
  for (const [name, addr] of contracts) {
    try {
      const code = await (provider as any).getCode(addr, true);
      const isCode = code && code !== '0x' && code !== '0x0';
      console.log(`${name}: ${isCode ? '✓ INDEXED' : '✗ not indexed'}`);
    } catch (e: unknown) {
      console.log(`${name}: ✗ - ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

check().catch(console.error);
