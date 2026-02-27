import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { networks } from '@btc-vision/bitcoin';
import { Mnemonic, MLDSASecurityLevel, AddressTypes, Address } from '@btc-vision/transaction';
import { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', 'contract', '.env') });

const NETWORK = networks.opnetTestnet;
const RPC_URL = 'https://testnet.opnet.org';

const POOL_ADDRESS = 'opt1sqz67am5aywdx39uza7u6sevruf32t23k9vdhls62';
const BANK_ADDRESS = 'opt1sqrvknudxl4vtwkfyc3nhl8mcfrtngztp8cm8l4n5';
const PIGGY_ADDRESS = 'opt1sqrgk6v53fcu9pv795usf8qavrd3x43ec6vxp09ek';

const OP20_ABI: BitcoinInterfaceAbi = [
    {
        name: 'increaseAllowance',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
];

const POOL_INIT_ABI: BitcoinInterfaceAbi = [
    {
        name: 'initializeLiquidity',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'bankAmount', type: ABIDataTypes.UINT256 },
            { name: 'piggyAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
];

async function main() {
    const mnemonic = new Mnemonic(process.env['DEPLOYER_MNEMONIC']!, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Resolve wallet address
    const pubKeyInfo = await provider.getPublicKeyInfo(wallet.p2tr);
    const hashedMLDSAHex = '0x' + Buffer.from(pubKeyInfo as Uint8Array).toString('hex');
    const pubkeyHex = '0x' + Buffer.from(wallet._bufferPubKey as Uint8Array).toString('hex');
    const fromAddr = Address.fromString(hashedMLDSAHex, pubkeyHex);

    // Resolve pool address - getPublicKeyInfo with true returns Address directly
    const poolAddrObj = await provider.getPublicKeyInfo(POOL_ADDRESS, true) as unknown as Address;
    console.log('Pool address object:', poolAddrObj);

    const SEED = BigInt('1000000000000'); // 10,000 tokens

    const txParams = {
        signer: wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo: wallet.p2tr,
        feeRate: 5,
        priorityFee: 0n,
        gasSatFee: 100_000n,
        maximumAllowedSatToSpend: 100_000n,
        linkMLDSAPublicKeyToAddress: false,
        network: NETWORK,
    };

    // Step 1: Approve BANK
    console.log('Step 1: increaseAllowance BANK for pool...');
    const bankContract = getContract(BANK_ADDRESS, OP20_ABI, provider, NETWORK, fromAddr);
    const bankApproveSim = await (bankContract as any).increaseAllowance(poolAddrObj, SEED);
    if (bankApproveSim.revert) throw new Error('BANK approve reverted: ' + bankApproveSim.revert);
    const bankApproveTx = await bankApproveSim.sendTransaction(txParams);
    console.log('  BANK approve TX:', bankApproveTx.transactionId);

    console.log('  Waiting 150s for indexing...');
    await new Promise(r => setTimeout(r, 150_000));

    // Step 2: Approve PIGGY
    console.log('Step 2: increaseAllowance PIGGY for pool...');
    const piggyContract = getContract(PIGGY_ADDRESS, OP20_ABI, provider, NETWORK, fromAddr);
    const piggyApproveSim = await (piggyContract as any).increaseAllowance(poolAddrObj, SEED);
    if (piggyApproveSim.revert) throw new Error('PIGGY approve reverted: ' + piggyApproveSim.revert);
    const piggyApproveTx = await piggyApproveSim.sendTransaction(txParams);
    console.log('  PIGGY approve TX:', piggyApproveTx.transactionId);

    console.log('  Waiting 150s for indexing...');
    await new Promise(r => setTimeout(r, 150_000));

    // Step 3: Initialize liquidity
    console.log('Step 3: Calling initializeLiquidity...');
    const poolContract = getContract(POOL_ADDRESS, POOL_INIT_ABI, provider, NETWORK, fromAddr);
    const initSim = await (poolContract as any).initializeLiquidity(SEED, SEED);
    if (initSim.revert) throw new Error('initializeLiquidity reverted: ' + initSim.revert);
    const initTx = await initSim.sendTransaction(txParams);
    console.log('Pool seeded! TX:', initTx.transactionId);
    console.log('Done.');
}

main().catch(err => {
    console.error('Failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
});
