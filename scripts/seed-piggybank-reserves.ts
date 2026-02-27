/**
 * Seed the PiggyBank contract with BANK reserves.
 * This is needed so swapPiggyForBank has BANK to send back to users.
 *
 * Flow:
 *  1. increaseAllowance: BANK → PiggyBank (so PiggyBank can pull BANK)
 *  2. createVault on PiggyBank (deployer needs a vault for swapForDust)
 *  3. swapForDust: sends BANK to PiggyBank, which stores it as reserves
 */
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

const BANK_ADDRESS  = 'opt1sqrvknudxl4vtwkfyc3nhl8mcfrtngztp8cm8l4n5';
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

const PIGGY_ABI: BitcoinInterfaceAbi = [
    {
        name: 'createVault',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'mode', type: ABIDataTypes.UINT8 },
            { name: 'bps', type: ABIDataTypes.UINT16 },
            { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
    },
    {
        name: 'swapForDust',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'bankAmount', type: ABIDataTypes.UINT256 },
            { name: 'minPiggyOut', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'piggyToWallet', type: ABIDataTypes.UINT256 },
            { name: 'dustToVault', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getDustConfig',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'mode', type: ABIDataTypes.UINT256 },
            { name: 'bps', type: ABIDataTypes.UINT256 },
            { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
        ],
    },
];

async function main() {
    const mnemonic = new Mnemonic(process.env['DEPLOYER_MNEMONIC']!, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Resolve addresses
    const pubKeyInfo = await provider.getPublicKeyInfo(wallet.p2tr);
    const hashedMLDSAHex = '0x' + Buffer.from(pubKeyInfo as Uint8Array).toString('hex');
    const pubkeyHex = '0x' + Buffer.from(wallet._bufferPubKey as Uint8Array).toString('hex');
    const fromAddr = Address.fromString(hashedMLDSAHex, pubkeyHex);

    const piggyAddrObj = await provider.getPublicKeyInfo(PIGGY_ADDRESS, true) as unknown as Address;

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

    const SEED = BigInt('500000000000'); // 5,000 BANK tokens to seed reserves

    // Step 1: Approve PiggyBank to spend deployer's BANK
    console.log('Step 1: increaseAllowance BANK → PiggyBank...');
    const bankContract = getContract(BANK_ADDRESS, OP20_ABI, provider, NETWORK, fromAddr);
    const approveSim = await (bankContract as any).increaseAllowance(piggyAddrObj, SEED);
    if (approveSim.revert) throw new Error('Approve reverted: ' + approveSim.revert);
    const approveTx = await approveSim.sendTransaction(txParams);
    console.log('  TX:', approveTx.transactionId);

    console.log('  Waiting 150s for indexing...');
    await new Promise(r => setTimeout(r, 150_000));

    // Step 2: Create vault (if deployer doesn't have one yet)
    console.log('Step 2: createVault on PiggyBank...');
    const piggyContract = getContract(PIGGY_ADDRESS, PIGGY_ABI, provider, NETWORK, fromAddr);
    try {
        const vaultSim = await (piggyContract as any).createVault(2, 500, BigInt(10)); // mode=2 (5% tax), 10 blocks lock
        if (vaultSim.revert) {
            console.log('  Vault already exists or error:', vaultSim.revert);
        } else {
            const vaultTx = await vaultSim.sendTransaction(txParams);
            console.log('  Vault TX:', vaultTx.transactionId);
            console.log('  Waiting 150s for indexing...');
            await new Promise(r => setTimeout(r, 150_000));
        }
    } catch (e) {
        console.log('  Vault creation skipped:', e instanceof Error ? e.message : String(e));
    }

    // Step 3: swapForDust — sends BANK to PiggyBank contract
    console.log('Step 3: swapForDust to seed BANK reserves...');
    const swapSim = await (piggyContract as any).swapForDust(SEED, 0n);
    if (swapSim.revert) throw new Error('swapForDust reverted: ' + swapSim.revert);
    const swapTx = await swapSim.sendTransaction(txParams);
    console.log('  Swap TX:', swapTx.transactionId);
    console.log('Done! PiggyBank now has BANK reserves for swapPiggyForBank.');
}

main().catch(err => {
    console.error('Failed:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
});
