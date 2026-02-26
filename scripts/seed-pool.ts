/**
 * SatStashPool Seed Script — OPNet
 *
 * Calls initializeLiquidity(bankAmount, piggyAmount) on the deployed SatStashPool
 * from the deployer wallet to bootstrap initial reserves.
 *
 * Steps performed:
 *   1. Approve pool to spend BANK
 *   2. Approve pool to spend PIGGY
 *   3. Call initializeLiquidity on pool
 *
 * Usage:
 *   cd scripts
 *   POOL_ADDRESS=<addr> BANK_TOKEN_ADDRESS=<addr> PIGGY_TOKEN_ADDRESS=<addr> \
 *     npx tsx seed-pool.ts [testnet|regtest]
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { networks } from '@btc-vision/bitcoin';
import {
    Mnemonic,
    MLDSASecurityLevel,
    AddressTypes,
    Address,
} from '@btc-vision/transaction';
import { JSONRpcProvider, getContract, ABIDataTypes, BitcoinAbiTypes } from 'opnet';
import type { BitcoinInterfaceAbi } from 'opnet';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '..', 'contract', '.env') });

// ── Config ──────────────────────────────────────────────────────────────────

const networkArg = process.argv.find(a => ['testnet', 'regtest', 'mainnet'].includes(a)) ?? 'testnet';

const NETWORK_MAP = {
    regtest: networks.regtest,
    testnet: networks.opnetTestnet,
    mainnet: networks.bitcoin,
} as const;

const RPC_MAP: Record<string, string> = {
    regtest: 'https://regtest.opnet.org',
    testnet: 'https://testnet.opnet.org',
    mainnet: 'https://mainnet.opnet.org',
};

// Seed amounts: 1,000,000 BANK and 10,000,000 PIGGY (8 decimals each)
const BANK_SEED_AMOUNT  = BigInt('100000000000000');  // 1,000,000 × 10^8
const PIGGY_SEED_AMOUNT = BigInt('1000000000000000'); // 10,000,000 × 10^8

// ── ABIs ────────────────────────────────────────────────────────────────────

const OP20_APPROVE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'approve',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount',  type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
];

const POOL_INIT_ABI: BitcoinInterfaceAbi = [
    {
        name: 'initializeLiquidity',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'bankAmount',  type: ABIDataTypes.UINT256 },
            { name: 'piggyAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an Address object for a WALLET address (has MLDSA key).
 * Address.fromString(hashedMLDSAKey_hex, compressedSecp256k1PubKey_hex)
 */
async function walletToAddress(
    provider: JSONRpcProvider,
    wallet: ReturnType<Mnemonic['deriveOPWallet']>,
): Promise<Address> {
    const hashedMLDSARaw = await provider.getPublicKeyInfo(wallet.p2tr);
    const hashedMLDSAHex = '0x' + Buffer.from(hashedMLDSARaw as Uint8Array).toString('hex');
    const pubkeyHex      = '0x' + Buffer.from(wallet._bufferPubKey as Uint8Array).toString('hex');
    return Address.fromString(hashedMLDSAHex, pubkeyHex);
}

/**
 * Build an Address object for a CONTRACT address (no MLDSA key).
 * Uses the tweakedPubkey (32-byte x-only) from the OPNet RPC.
 * The hashed MLDSA slot is filled with the same tweaked pubkey bytes.
 */
function contractToAddress(tweakedPubkeyHex: string): Address {
    // Use the 32-byte x-only pubkey for the MLDSA slot (contracts have no MLDSA key).
    // Compress it to 33 bytes by prepending 0x02 (even y assumed; OPNet uses x-only internally).
    const mldsaSlotHex  = '0x' + tweakedPubkeyHex;              // 32 bytes
    const compressed33  = '0x02' + tweakedPubkeyHex;             // 33 bytes
    return Address.fromString(mldsaSlotHex, compressed33);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log(`\nSatStashPool Seed Script — OPNet (${networkArg})`);
    console.log('─'.repeat(55));

    const NETWORK = NETWORK_MAP[networkArg as keyof typeof NETWORK_MAP];
    if (!NETWORK) throw new Error(`Unknown network: ${networkArg}`);

    const RPC_URL = RPC_MAP[networkArg];
    if (!RPC_URL) throw new Error(`No RPC URL for ${networkArg}`);

    const mnemonicPhrase = process.env['DEPLOYER_MNEMONIC'];
    if (!mnemonicPhrase) throw new Error('DEPLOYER_MNEMONIC not set in contract/.env');

    const poolAddress  = process.env['POOL_ADDRESS'];
    const bankAddress  = process.env['BANK_TOKEN_ADDRESS'];
    const piggyAddress = process.env['PIGGY_TOKEN_ADDRESS'];
    // Tweaked pubkey for the pool — obtained from OPNet RPC at deploy time.
    // Update this if pool is redeployed.
    const poolTweakedPubkey = process.env['POOL_TWEAKED_PUBKEY']
        ?? '527083e04153ab99fbdbac9af582b7cf290e53524f6106a6d60a67d4c01bc56f';

    if (!poolAddress)  throw new Error('POOL_ADDRESS env var required');
    if (!bankAddress)  throw new Error('BANK_TOKEN_ADDRESS env var required');
    if (!piggyAddress) throw new Error('PIGGY_TOKEN_ADDRESS env var required');

    const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet   = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`\nWallet (P2TR): ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });

    // Build Address objects
    const fromAddr    = await walletToAddress(provider, wallet);
    const poolAddrObj = contractToAddress(poolTweakedPubkey);

    const txParams = {
        signer:      wallet.keypair,
        mldsaSigner: wallet.mldsaKeypair,
        refundTo:    wallet.p2tr,
        feeRate:     5,
        priorityFee: 0n,
        gasSatFee:   100_000n,
        network:     NETWORK,
    };

    // ── Step 1: Approve pool to spend BANK ──────────────────────────────────

    console.log(`\nStep 1: Approving pool to spend ${BANK_SEED_AMOUNT} BANK...`);
    const bankContract = getContract(bankAddress, OP20_APPROVE_ABI, provider, NETWORK, fromAddr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const approveBankSim = await (bankContract as any).approve(poolAddrObj, BANK_SEED_AMOUNT);
    if (approveBankSim.revert) throw new Error(`BANK approve simulation reverted: ${String(approveBankSim.revert)}`);

    const approveBankTx = await approveBankSim.sendTransaction(txParams);
    console.log(`  BANK approve TX: ${JSON.stringify(approveBankTx)}`);
    console.log('  (waiting 30s for propagation...)');
    await new Promise(r => setTimeout(r, 30_000));

    // ── Step 2: Approve pool to spend PIGGY ─────────────────────────────────

    console.log(`\nStep 2: Approving pool to spend ${PIGGY_SEED_AMOUNT} PIGGY...`);
    const piggyContract = getContract(piggyAddress, OP20_APPROVE_ABI, provider, NETWORK, fromAddr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const approvePiggySim = await (piggyContract as any).approve(poolAddrObj, PIGGY_SEED_AMOUNT);
    if (approvePiggySim.revert) throw new Error(`PIGGY approve simulation reverted: ${String(approvePiggySim.revert)}`);

    const approvePiggyTx = await approvePiggySim.sendTransaction(txParams);
    console.log(`  PIGGY approve TX: ${JSON.stringify(approvePiggyTx)}`);
    console.log('  (waiting 30s for propagation...)');
    await new Promise(r => setTimeout(r, 30_000));

    // ── Step 3: Initialize liquidity ────────────────────────────────────────

    console.log(`\nStep 3: Initializing pool liquidity...`);
    console.log(`  BANK amount:  ${BANK_SEED_AMOUNT} (${Number(BANK_SEED_AMOUNT) / 1e8} BANK)`);
    console.log(`  PIGGY amount: ${PIGGY_SEED_AMOUNT} (${Number(PIGGY_SEED_AMOUNT) / 1e8} PIGGY)`);

    const poolContract = getContract(poolAddress, POOL_INIT_ABI, provider, NETWORK, fromAddr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initSim = await (poolContract as any).initializeLiquidity(BANK_SEED_AMOUNT, PIGGY_SEED_AMOUNT);
    if (initSim.revert) throw new Error(`initializeLiquidity simulation reverted: ${String(initSim.revert)}`);

    const initTx = await initSim.sendTransaction(txParams);

    console.log(`\nPool seeded! TX: ${JSON.stringify(initTx)}`);
    console.log('─'.repeat(55));
    console.log('SatStashPool is live and ready for swaps.');
    console.log(`  Initial rate: 1 BANK = ${Number(PIGGY_SEED_AMOUNT) / Number(BANK_SEED_AMOUNT)} PIGGY`);
    console.log('─'.repeat(55));
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nSeed failed: ${msg}`);
    process.exit(1);
});
