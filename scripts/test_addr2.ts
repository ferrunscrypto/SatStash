import { networks } from '@btc-vision/bitcoin';
import { Address } from '@btc-vision/transaction';

const BANK = 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl';

// Try to create an Address from the p2op string
try {
  const addr = (Address as any).fromBech32(BANK);
  console.log('fromBech32:', addr);
} catch(e) { console.log('fromBech32 error:', e); }

// Check what Address exports
const addrKeys = Object.getOwnPropertyNames(Address).filter(k => k !== 'length' && k !== 'name' && k !== 'prototype');
console.log('Address static methods:', addrKeys);

// Check instance methods
const protoKeys = Object.getOwnPropertyNames(Address.prototype).filter(k => k !== 'constructor');
console.log('Address proto methods:', protoKeys);

