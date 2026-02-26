import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';

const provider = new JSONRpcProvider({ url: 'https://testnet.opnet.org', network: networks.opnetTestnet });

const BANK = 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl';

// Try getPublicKeyInfo on the provider
try {
  const info = await (provider as any).getPublicKeyInfo(BANK);
  console.log('getPublicKeyInfo result:', JSON.stringify(info));
  console.log('type:', typeof info, 'isBuffer:', Buffer.isBuffer(info));
  if (info) {
    const hex = Buffer.from(info).toString('hex');
    console.log('as hex:', hex, 'len:', hex.length/2);
  }
} catch(e) {
  console.log('getPublicKeyInfo error:', e);
}

// Try the raw JSON RPC directly
try {
  const resp = await (provider as any).call({
    method: 'getPublicKeyInfo',
    params: [{ addresses: [BANK] }],
  });
  console.log('raw call:', JSON.stringify(resp));
} catch(e) {
  console.log('raw call error:', String(e));
}

