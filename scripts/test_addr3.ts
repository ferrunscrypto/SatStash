import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const BANK = 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl';

// Check all Address.wrap possibilities
try {
  const addr = Address.wrap(BANK);
  console.log('wrap:', addr.toString(), 'toHex:', addr.toHex(), 'tweakedToHex:', addr.tweakedToHex());
} catch(e) { console.log('wrap error:', String(e)); }

// Check all Address.fromString possibilities  
// fromString(mldsaKey, pubkey) - so what can we pass?
// Maybe fromString can accept a single arg that's the address?
try {
  const addr = (Address as any).fromString(BANK);
  console.log('fromString(addr):', addr.toHex());
} catch(e) { console.log('fromString(addr) error:', String(e)); }

