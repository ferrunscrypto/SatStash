import { useMemo } from 'react';
import { JSONRpcProvider } from 'opnet';
import { Network } from '@btc-vision/bitcoin';
import { getRpcUrl } from '../config/networks';

const providerCache = new Map<string, JSONRpcProvider>();

export function useProvider(network: Network | null | undefined): JSONRpcProvider | null {
    return useMemo(() => {
        if (!network) return null;

        try {
            const rpcUrl = getRpcUrl(network);
            const key = rpcUrl;

            if (!providerCache.has(key)) {
                const provider = new JSONRpcProvider({ url: rpcUrl, network });
                providerCache.set(key, provider);
            }

            return providerCache.get(key)!;
        } catch {
            return null;
        }
    }, [network]);
}
