// Test how to extract 32 bytes from a p2op address
import { address as btcAddress, networks } from '@btc-vision/bitcoin';

const BANK = 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl';

// Method 1: try toOutputScript
try {
  const script = btcAddress.toOutputScript(BANK, networks.opnetTestnet);
  console.log('toOutputScript:', script.toString('hex'), 'len:', script.length);
  // P2TR script is: OP_1 <32bytes> = 0x5120 + 32 bytes = 34 bytes
  // Extract the 32 bytes (skip first 2 bytes: 0x51 0x20)
  const hash = script.slice(2); // remove OP_1 and push opcode
  console.log('hash32:', hash.toString('hex'), 'len:', hash.length);
} catch(e) {
  console.log('toOutputScript error:', e);
}

