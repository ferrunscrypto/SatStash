import { useState, useEffect, useCallback, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { useProvider } from './useProvider';
import { usePiggyBankContract, useBankTokenContract } from './usePiggyBank';
import { getContractAddress } from '../config/contracts';

export interface Position {
    balance: bigint;
    unlockBlock: bigint;
    depositCount: bigint;
}

export interface DustConfig {
    mode: bigint;       // 0 = no vault, 1 = round-up, 2 = fixed%
    bps: bigint;
    lockBlocks: bigint;
}

export interface PiggyBankData {
    readonly position: Position | null;
    readonly dustConfig: DustConfig | null;
    readonly canWithdraw: boolean;
    readonly blocksRemaining: bigint;
    readonly currentBlock: number;
    readonly totalLocked: bigint;
    readonly bankBalance: bigint;
    readonly piggyBalance: bigint;
    readonly loading: boolean;
    readonly error: string | null;
    readonly refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 30_000;

export function usePiggyBankData(
    walletAddress: string | null | undefined,
    resolvedAddress: Address | null | undefined,
    network: Network | null | undefined,
): PiggyBankData {
    const provider = useProvider(network);
    const contract = usePiggyBankContract(network);
    const bankContract = useBankTokenContract(network);

    const [position, setPosition] = useState<Position | null>(null);
    const [dustConfig, setDustConfig] = useState<DustConfig | null>(null);
    const [canWithdrawFlag, setCanWithdrawFlag] = useState(false);
    const [blocksRemaining, setBlocksRemaining] = useState(0n);
    const [currentBlock, setCurrentBlock] = useState(0);
    const [totalLocked, setTotalLocked] = useState(0n);
    const [bankBalance, setBankBalance] = useState(0n);
    const [piggyBalance, setPiggyBalance] = useState(0n);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const refresh = useCallback(async () => {
        if (!contract || !provider || !resolvedAddress) {
            setPosition(null);
            setDustConfig(null);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const [blockNum, posResult, tvlResult, dustResult] = await Promise.all([
                provider.getBlockNumber(),
                contract.getPosition(resolvedAddress),
                contract.getTotalLocked(),
                contract.getDustConfig(resolvedAddress),
            ]);

            if (!mountedRef.current) return;

            if ('error' in posResult && posResult.error) {
                setError(String(posResult.error));
                return;
            }

            const block = Number(blockNum);
            setCurrentBlock(block);

            const props = posResult.properties as {
                balance: bigint;
                unlockBlock: bigint;
                depositCount: bigint;
            };

            const pos: Position = {
                balance: props.balance ?? 0n,
                unlockBlock: props.unlockBlock ?? 0n,
                depositCount: props.depositCount ?? 0n,
            };
            setPosition(pos);

            const isReady = pos.balance > 0n && BigInt(block) >= pos.unlockBlock;
            setCanWithdrawFlag(isReady);
            setBlocksRemaining(isReady ? 0n : pos.unlockBlock - BigInt(block));

            if (!('error' in tvlResult)) {
                setTotalLocked((tvlResult.properties as { total: bigint }).total ?? 0n);
            }

            // Dust config
            if (!('error' in dustResult)) {
                const dp = dustResult.properties as { mode: bigint; bps: bigint; lockBlocks: bigint };
                setDustConfig({
                    mode: dp.mode ?? 0n,
                    bps: dp.bps ?? 0n,
                    lockBlocks: dp.lockBlocks ?? 0n,
                });
            }

            // Token balances
            if (resolvedAddress && walletAddress) {
                const balancePromises: Promise<unknown>[] = [
                    // PIGGY balance from piggyBank contract
                    contract.balanceOf(resolvedAddress),
                ];

                // BANK balance
                if (bankContract) {
                    balancePromises.push(bankContract.balanceOf(resolvedAddress));
                }

                const results = await Promise.all(balancePromises);
                if (!mountedRef.current) return;

                const piggyRes = results[0] as { properties?: { balance: bigint }; error?: unknown };
                if (!('error' in piggyRes) && piggyRes.properties) {
                    setPiggyBalance(piggyRes.properties.balance ?? 0n);
                }

                if (results[1] && bankContract) {
                    const bankRes = results[1] as { properties?: { balance: bigint }; error?: unknown };
                    if (!('error' in bankRes) && bankRes.properties) {
                        setBankBalance(bankRes.properties.balance ?? 0n);
                    }
                }

                // Suppress unused variable warning
                void getContractAddress;
            }
        } catch (err: unknown) {
            if (!mountedRef.current) return;
            const message = err instanceof Error ? err.message : 'Failed to load position';
            console.error('[PiggyBank] refresh error:', err);
            setError(message);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [contract, provider, resolvedAddress, bankContract, walletAddress]);

    useEffect(() => {
        void refresh();
        const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [refresh]);

    return {
        position,
        dustConfig,
        canWithdraw: canWithdrawFlag,
        blocksRemaining,
        currentBlock,
        totalLocked,
        bankBalance,
        piggyBalance,
        loading,
        error,
        refresh,
    };
}
