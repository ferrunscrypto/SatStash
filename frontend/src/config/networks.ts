import { networks, Network } from '@btc-vision/bitcoin';

export interface NetworkConfig {
    readonly name: string;
    readonly rpcUrl: string;
    readonly explorerUrl: string;
}

export const NETWORK_CONFIGS: Map<string, NetworkConfig> = new Map([
    ['mainnet', {
        name: 'Mainnet',
        rpcUrl: 'https://mainnet.opnet.org',
        explorerUrl: 'https://explorer.opnet.org',
    }],
    ['testnet', {
        name: 'OPNet Testnet',
        rpcUrl: 'https://testnet.opnet.org',
        explorerUrl: 'https://mempool.opnet.org/testnet4/tx/',
    }],
    ['regtest', {
        name: 'Regtest',
        rpcUrl: 'https://regtest.opnet.org',
        explorerUrl: 'https://regtest.opnet.org',
    }],
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNetworkId(network: any): string {
    if (!network) return 'unknown';

    const netStr: unknown = network.network;
    if (typeof netStr === 'string') {
        const n = netStr.toLowerCase();
        if (n === 'mainnet' || n === 'livenet' || n === 'bitcoin') return 'mainnet';
        if (n === 'testnet' || n === 'signet') return 'testnet';
        if (n === 'regtest') return 'regtest';
    }

    const chainType: unknown = network.chainType;
    if (typeof chainType === 'string') {
        const ct = chainType.toLowerCase();
        if (ct.includes('mainnet')) return 'mainnet';
        if (ct.includes('opnet') || ct.includes('testnet') || ct.includes('signet')) return 'testnet';
        if (ct.includes('regtest')) return 'regtest';
    }

    const bech32: unknown = network.bech32;
    if (typeof bech32 === 'string') {
        if (bech32 === 'bc') return 'mainnet';
        if (bech32 === 'opt' || bech32 === 'tb') return 'testnet';
        if (bech32 === 'bcrt') return 'regtest';
    }

    if (network === networks.bitcoin) return 'mainnet';
    if (network === networks.opnetTestnet) return 'testnet';
    if (network === networks.regtest) return 'regtest';

    console.warn('[PiggyBank] Unknown network object:', JSON.stringify(network));
    return 'unknown';
}

export function getNetworkName(network: Network): string {
    const id = getNetworkId(network);
    const config = NETWORK_CONFIGS.get(id);
    return config?.name ?? id;
}

export function getRpcUrl(network: Network): string {
    const id = getNetworkId(network);
    const config = NETWORK_CONFIGS.get(id);
    if (!config) {
        throw new Error(`Unsupported network: ${id}`);
    }
    return config.rpcUrl;
}
