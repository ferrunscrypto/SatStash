import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

const BANK = 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl';

// Check what methods provider has
const proto = Object.getOwnPropertyNames(Object.getPrototypeOf(provider));
const rawMethods = proto.filter(m => m.toLowerCase().includes('raw') || m.toLowerCase().includes('key') || m.toLowerCase().includes('public'));
console.log('Relevant provider methods:', rawMethods);

// Try getPublicKeysInfoRaw
try {
  const info = await (provider as any).getPublicKeysInfoRaw([BANK]);
  console.log('getPublicKeysInfoRaw result:', JSON.stringify(info));
} catch(e) {
  console.log('getPublicKeysInfoRaw error:', String(e));
}

