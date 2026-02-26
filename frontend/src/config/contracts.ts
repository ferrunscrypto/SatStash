import { Network } from '@btc-vision/bitcoin';
import { getNetworkId } from './networks';

export interface ContractAddresses {
    readonly piggyBank: string;
    readonly bankToken: string;
    readonly pool: string;
}

const CONTRACT_ADDRESSES: Map<string, ContractAddresses> = new Map([
    ['regtest', {
        piggyBank: import.meta.env['VITE_PIGGYBANK_ADDRESS'] ?? '',
        bankToken: import.meta.env['VITE_BANK_ADDRESS'] ?? '',
        pool:      import.meta.env['VITE_POOL_ADDRESS'] ?? '',
    }],
    ['testnet', {
        piggyBank: import.meta.env['VITE_PIGGYBANK_ADDRESS'] ?? '',
        bankToken: import.meta.env['VITE_BANK_ADDRESS'] ?? '',
        pool:      import.meta.env['VITE_POOL_ADDRESS'] ?? '',
    }],
    ['mainnet', {
        piggyBank: '',
        bankToken: '',
        pool:      '',
    }],
]);

export function getContractAddress(
    contract: keyof ContractAddresses,
    network: Network,
): string | null {
    const key = getNetworkId(network);
    const addresses = CONTRACT_ADDRESSES.get(key);
    if (!addresses) return null;

    const address = addresses[contract];
    if (!address || address === '') return null;

    return address;
}
