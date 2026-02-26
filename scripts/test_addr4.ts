import { address as btcAddress, networks } from '@btc-vision/bitcoin';

// Decode the BANK address (indexed) to get its witness program
const BANK = 'opt1sqrqc3hyvwf46z0ys80jactw0d4x0j4v60y7qg6tl';
const PIGGY_NEW = 'opt1sqpezzj9qh0ht0s2g03njppp4mxmuz0udycg0cudq';

for (const [name, addr] of [['BANK', BANK], ['PIGGY_NEW', PIGGY_NEW]]) {
  const script = btcAddress.toOutputScript(addr as string, networks.opnetTestnet);
  console.log(`\n${name}: ${addr}`);
  console.log('Script len:', script.length, 'hex:', Buffer.from(script).toString('hex'));
  // Strip 2-byte prefix (OP_16 + push N)
  const witnessProgram = script.slice(2);
  console.log('Witness program len:', witnessProgram.length, 'hex:', Buffer.from(witnessProgram).toString('hex'));
}

// Compare: Bank tweakedPubkey from RPC = 210898278fcf82dcf1182e341e620dd298865cfdf623c66133c8a93fc3cc99ff
console.log('\nExpected tweakedPubkey from RPC: 210898278fcf82dcf1182e341e620dd298865cfdf623c66133c8a93fc3cc99ff');
