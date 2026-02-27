import { useState, useEffect, useRef, useMemo } from 'react';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { JSONRpcProvider } from 'opnet';
import { networks } from '@btc-vision/bitcoin';
import { useProvider } from './useProvider';

// OPNet testnet: ~4 minute blocks
export const AVG_BLOCK_SECONDS = 240;

export interface BlockInfo {
    blockNumber: number;
    secondsSinceBlock: number;
    loading: boolean;
}

/** Fallback provider using env config — works without wallet */
function useFallbackProvider(): JSONRpcProvider {
    return useMemo(() => {
        const url = import.meta.env['VITE_RPC_URL'] ?? 'https://testnet.opnet.org';
        const netName = (import.meta.env['VITE_NETWORK'] ?? 'testnet').toLowerCase();
        const network = netName === 'mainnet' ? networks.bitcoin
            : netName === 'regtest' ? networks.regtest
            : networks.opnetTestnet;
        return new JSONRpcProvider({ url, network });
    }, []);
}

export function useBlockInfo(): BlockInfo {
    const { network } = useWalletConnect();
    const walletProvider = useProvider(network ?? null);
    const fallbackProvider = useFallbackProvider();
    const provider = walletProvider ?? fallbackProvider;

    const [blockNumber, setBlockNumber] = useState(0);
    const [secondsSinceBlock, setSecondsSinceBlock] = useState(0);
    const [loading, setLoading] = useState(true);
    const lastFetchedBlock = useRef(0);
    const blockSeenAt = useRef(0);

    useEffect(() => {
        let cancelled = false;

        async function fetchBlock() {
            try {
                const num = await provider.getBlockNumber();
                const blockNum = Number(num);
                if (cancelled) return;

                setBlockNumber(blockNum);

                if (blockNum !== lastFetchedBlock.current) {
                    lastFetchedBlock.current = blockNum;

                    // Try to get accurate on-chain block time
                    let ref = Date.now();
                    try {
                        const block = await provider.getBlock(num, false);
                        if (!cancelled && block?.time && block.time > 1_000_000_000_000) {
                            ref = block.time;
                        }
                    } catch {
                        // ignore — fall back to Date.now() recorded above
                    }

                    blockSeenAt.current = ref;
                    setSecondsSinceBlock(Math.floor((Date.now() - ref) / 1000));
                }

                setLoading(false);
            } catch { setLoading(false); }
        }

        fetchBlock();
        const poll = setInterval(fetchBlock, 15_000);
        return () => { cancelled = true; clearInterval(poll); };
    }, [provider]);

    // Tick every second — recompute elapsed time from ms reference
    useEffect(() => {
        const tick = setInterval(() => {
            if (blockSeenAt.current > 0) {
                setSecondsSinceBlock(Math.floor((Date.now() - blockSeenAt.current) / 1000));
            }
        }, 1_000);
        return () => clearInterval(tick);
    }, []);

    return { blockNumber, secondsSinceBlock, loading };
}
