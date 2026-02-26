/**
 * PiggyBank Deploy Script — OPNet Testnet
 *
 * Deploys contracts in order:
 *   1. BankToken  (BANK OP20)  — no calldata needed
 *   2. PiggyBank  (PIGGY OP20 + vault)  — calldata: bankToken address (32 bytes)
 *   3. SatStashPool (AMM) — calldata: bankToken address (32 bytes) + piggyBank address (32 bytes)
 *
 * Usage:
 *   1. Fill contract/.env: DEPLOYER_MNEMONIC
 *   2. Build WASMs: cd contract && npm run build:all
 *   3. Run: cd scripts && npm install && npx tsx deploy.ts [testnet|regtest]
 *
 * Pass --bank-only, --piggy-only, or --pool-only to deploy just one contract.
 * For --pool-only, set BANK_TOKEN_ADDRESS and PIGGY_TOKEN_ADDRESS env vars.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { networks } from '@btc-vision/bitcoin';
import {
    TransactionFactory,
    Mnemonic,
    MLDSASecurityLevel,
    AddressTypes,
} from '@btc-vision/transaction';
import { JSONRpcProvider } from 'opnet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from contract/.env
dotenv.config({ path: resolve(__dirname, '..', 'contract', '.env') });

// ── Config ─────────────────────────────────────────────────────────────────

const networkArg = process.argv.find(a => ['testnet', 'regtest', 'mainnet'].includes(a)) ?? 'testnet';
const bankOnly  = process.argv.includes('--bank-only');
const piggyOnly = process.argv.includes('--piggy-only');
const poolOnly  = process.argv.includes('--pool-only');

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

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the 32-byte tweakedPubkey for a p2op contract address.
 * The contract must be indexed before calling this.
 */
async function getContractTweakedPubkey(
    provider: JSONRpcProvider,
    contractAddress: string,
): Promise<Buffer> {
    const info = await (provider as unknown as Record<string, (addrs: string[]) => Promise<Record<string, { tweakedPubkey: string }>>>)
        .getPublicKeysInfoRaw([contractAddress]);
    const tweakedPubkey = info[contractAddress]?.tweakedPubkey;
    if (!tweakedPubkey) {
        throw new Error(
            `Could not get tweakedPubkey for ${contractAddress}.\n` +
            `Is the contract indexed? Use --bank-only first, wait for indexing, then run --piggy-only.`,
        );
    }
    return Buffer.from(tweakedPubkey, 'hex');
}

async function deployContract(
    factory: TransactionFactory,
    provider: JSONRpcProvider,
    wallet: ReturnType<Mnemonic['deriveOPWallet']>,
    wasmPath: string,
    calldata: Uint8Array,
    name: string,
    NETWORK: typeof networks[keyof typeof networks],
): Promise<string> {
    console.log(`\nDeploying ${name}...`);

    if (!existsSync(wasmPath)) {
        throw new Error(`WASM not found: ${wasmPath}\nRun: cd contract && npm run build:all`);
    }
    const wasm = readFileSync(wasmPath);
    console.log(`  WASM: ${wasm.length} bytes`);

    const utxos = await provider.utxoManager.getUTXOs({ address: wallet.p2tr });
    if (utxos.length === 0) {
        throw new Error(`No UTXOs found. Fund wallet: ${wallet.p2tr}`);
    }
    console.log(`  UTXOs: ${utxos.length}`);

    const challenge = await provider.getChallenge();

    const deployment = await factory.signDeployment({
        from:                        wallet.p2tr,
        utxos,
        signer:                      wallet.keypair,
        mldsaSigner:                 wallet.mldsaKeypair,
        network:                     NETWORK,
        feeRate:                     5,
        priorityFee:                 0n,
        gasSatFee:                   100_000n,
        bytecode:                    new Uint8Array(wasm),
        calldata,
        challenge,
        linkMLDSAPublicKeyToAddress: true,
        revealMLDSAPublicKey:        true,
    });

    console.log(`  Contract address: ${deployment.contractAddress}`);

    await provider.sendRawTransaction(deployment.transaction[0]);
    console.log('  TX[0] broadcast (funding)');

    await provider.sendRawTransaction(deployment.transaction[1]);
    console.log('  TX[1] broadcast (reveal)');

    console.log(`  ${name} deployed!`);
    return deployment.contractAddress;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log(`\nPiggyBank Deployment Suite — OPNet (${networkArg})`);
    console.log('─'.repeat(55));

    const NETWORK = NETWORK_MAP[networkArg as keyof typeof NETWORK_MAP];
    if (!NETWORK) throw new Error(`Unknown network: ${networkArg}`);

    const RPC_URL = RPC_MAP[networkArg];
    if (!RPC_URL) throw new Error(`No RPC URL for ${networkArg}`);

    const mnemonicPhrase = process.env['DEPLOYER_MNEMONIC'];
    if (!mnemonicPhrase) throw new Error('DEPLOYER_MNEMONIC not set in contract/.env');

    const mnemonic = new Mnemonic(mnemonicPhrase, '', NETWORK, MLDSASecurityLevel.LEVEL2);
    const wallet   = mnemonic.deriveOPWallet(AddressTypes.P2TR, 0);
    console.log(`\nWallet (P2TR): ${wallet.p2tr}`);

    const provider = new JSONRpcProvider({ url: RPC_URL, network: NETWORK });
    const factory  = new TransactionFactory();

    // Load existing deployments
    const recordPath = resolve(__dirname, '..', 'deployments.json');
    const existing: Record<string, unknown>[] = existsSync(recordPath)
        ? (JSON.parse(readFileSync(recordPath, 'utf8')) as Record<string, unknown>[])
        : [];

    let bankAddress  = process.env['BANK_TOKEN_ADDRESS'] ?? '';
    let piggyAddress = process.env['PIGGY_TOKEN_ADDRESS'] ?? '';

    // Will the pool be deployed in this run?
    const willDeployPool = poolOnly || (!bankOnly && !piggyOnly);

    // ── Step 1: Deploy BankToken ─────────────────────────────────────────────

    if (!piggyOnly && !poolOnly) {
        const bankWasm = resolve(__dirname, '..', 'contract', 'build', 'BankToken.wasm');
        bankAddress = await deployContract(
            factory, provider, wallet, bankWasm,
            new Uint8Array(0),  // no calldata — all params hardcoded
            'BankToken',
            NETWORK,
        );

        existing.push({
            network:         networkArg,
            contract:        'BankToken',
            contractAddress: bankAddress,
            deployer:        wallet.p2tr,
            deployedAt:      new Date().toISOString(),
        });
        writeFileSync(recordPath, JSON.stringify(existing, null, 2));
        console.log(`\nBANK token address: ${bankAddress}`);
        console.log('(waiting ~30s for propagation before deploying PiggyBank...)');
        await new Promise(r => setTimeout(r, 30_000));
    }

    // ── Step 2: Deploy PiggyBank ──────────────────────────────────────────────

    if (!bankOnly && !poolOnly) {
        if (!bankAddress) {
            throw new Error('Bank token address required. Run without --piggy-only first, or set BANK_TOKEN_ADDRESS env var.');
        }

        const calldata = await getContractTweakedPubkey(provider, bankAddress); // 32 bytes

        const piggyWasm = resolve(__dirname, '..', 'contract', 'build', 'PiggyBank.wasm');
        piggyAddress = await deployContract(
            factory, provider, wallet, piggyWasm,
            new Uint8Array(calldata),
            'PiggyBank',
            NETWORK,
        );

        existing.push({
            network:         networkArg,
            contract:        'PiggyBank',
            contractAddress: piggyAddress,
            bankAddress,
            deployer:        wallet.p2tr,
            deployedAt:      new Date().toISOString(),
        });
        writeFileSync(recordPath, JSON.stringify(existing, null, 2));

        if (willDeployPool) {
            console.log(`\nPiggyBank deployed: ${piggyAddress}`);
            console.log('(waiting ~30s before deploying SatStashPool...)');
            await new Promise(r => setTimeout(r, 30_000));
        } else {
            console.log('\n─'.repeat(55));
            console.log('Deployment complete!');
            console.log(`\n  BANK token:  ${bankAddress}`);
            console.log(`  PiggyBank:   ${piggyAddress}`);
            console.log(`\nUpdate frontend/.env.${networkArg}:`);
            console.log(`  VITE_BANK_ADDRESS=${bankAddress}`);
            console.log(`  VITE_PIGGYBANK_ADDRESS=${piggyAddress}`);
            console.log('─'.repeat(55));
        }
    }

    // ── Step 3: Deploy SatStashPool ───────────────────────────────────────────

    if (willDeployPool) {
        if (!bankAddress) {
            throw new Error('BANK_TOKEN_ADDRESS env var required for pool deployment.');
        }
        if (!piggyAddress) {
            throw new Error('PIGGY_TOKEN_ADDRESS env var required for pool deployment.');
        }

        const calldata = Buffer.concat([
            await getContractTweakedPubkey(provider, bankAddress),   // 32 bytes
            await getContractTweakedPubkey(provider, piggyAddress),  // 32 bytes
        ]);

        const poolWasm = resolve(__dirname, '..', 'contract', 'build', 'SatStashPool.wasm');
        const poolAddress = await deployContract(
            factory, provider, wallet, poolWasm,
            new Uint8Array(calldata),
            'SatStashPool',
            NETWORK,
        );

        existing.push({
            network:         networkArg,
            contract:        'SatStashPool',
            contractAddress: poolAddress,
            bankAddress,
            piggyAddress,
            deployer:        wallet.p2tr,
            deployedAt:      new Date().toISOString(),
        });
        writeFileSync(recordPath, JSON.stringify(existing, null, 2));

        console.log('\n─'.repeat(55));
        console.log('Pool deployment complete!');
        console.log(`\n  SatStashPool: ${poolAddress}`);
        console.log(`\nUpdate frontend/.env.${networkArg}:`);
        console.log(`  VITE_POOL_ADDRESS=${poolAddress}`);
        console.log('\nNext: run seed-pool.ts to initialize liquidity.');
        console.log('─'.repeat(55));
    }
}

main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nDeployment failed: ${msg}`);
    process.exit(1);
});
