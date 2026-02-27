import { useState, useCallback, useEffect } from 'react';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { usePiggyBankContract } from '../hooks/usePiggyBank';
import { useProvider } from '../hooks/useProvider';
import type { Position, DustConfig } from '../hooks/usePiggyBankData';
import { getContractAddress } from '../config/contracts';

interface VaultDashboardProps {
    readonly walletAddress: string | null | undefined;
    readonly resolvedAddress: Address | null | undefined;
    readonly network: Network | null | undefined;
    readonly position: Position | null;
    readonly dustConfig: DustConfig | null;
    readonly canWithdraw: boolean;
    readonly blocksRemaining: bigint;
    readonly currentBlock: number;
    readonly totalLocked: bigint;
    readonly loading: boolean;
    readonly onSuccess: () => void;
}

const UNIT = 10n ** 8n;

function formatToken(amount: bigint): string {
    const whole = amount / UNIT;
    const frac = amount % UNIT;
    return `${whole.toLocaleString()},${frac.toString().padStart(8, '0').slice(0, 2)}`;
}

// OPNet testnet: 4 min blocks → 15 blocks/hr
const BLOCKS_PER_HOUR = 15;

function blocksToTime(blocks: bigint): string {
    if (blocks <= 0n) return 'Ready';
    const hours = Number(blocks) / BLOCKS_PER_HOUR;
    if (hours < 24) return `~${hours.toFixed(1)}h`;
    const days = hours / 24;
    if (days < 30) return `~${days.toFixed(0)}d`;
    return `~${(days / 30).toFixed(1)}mo`;
}

export function VaultDashboard({
    walletAddress,
    resolvedAddress,
    network,
    position,
    dustConfig,
    canWithdraw,
    blocksRemaining,
    currentBlock,
    totalLocked,
    loading,
    onSuccess,
}: VaultDashboardProps) {
    const piggyContract = usePiggyBankContract(network, resolvedAddress ?? undefined);
    const provider = useProvider(network);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [pendingTxId, setPendingTxId] = useState<string | null>(null);

    const piggyBankAddr = network ? getContractAddress('piggyBank', network) : null;

    const handleWithdraw = useCallback(async () => {
        if (!piggyContract || !walletAddress || !piggyBankAddr) return;
        setIsWithdrawing(true);
        try {
            const txParams = {
                signer: null as null,
                mldsaSigner: null as null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n,
                feeRate: 10,
                network: network!,
            };
            const sim = await piggyContract.withdraw();
            if (sim.revert) {
                console.error('Withdraw failed:', sim.revert);
                return;
            }
            const result = await sim.sendTransaction(txParams) as { transactionId?: string; txid?: string } | null;
            const txId = result?.transactionId ?? result?.txid ?? null;
            if (txId) {
                setPendingTxId(txId);
            } else {
                onSuccess();
            }
        } catch (e: unknown) {
            console.error('Withdraw error:', e);
        } finally {
            setIsWithdrawing(false);
        }
    }, [piggyContract, walletAddress, piggyBankAddr, network, onSuccess]);

    // Poll for on-chain confirmation after TX submission
    useEffect(() => {
        if (!pendingTxId || !provider) return;
        let cancelled = false;
        const confirm = () => { setPendingTxId(null); onSuccess(); };
        const poll = async () => {
            try {
                const tx = await provider.getTransaction(pendingTxId);
                if (!cancelled && tx && (tx as { blockNumber?: number }).blockNumber != null) confirm();
            } catch { /* not yet mined */ }
        };
        void poll();
        const interval = setInterval(() => { void poll(); }, 5000);
        const timeout = setTimeout(() => { if (!cancelled) confirm(); }, 60_000);
        return () => { cancelled = true; clearInterval(interval); clearTimeout(timeout); };
    }, [pendingTxId, provider, onSuccess]);

    const dustModeLabel = dustConfig
        ? dustConfig.mode === 1n
            ? 'Round-Up Dust'
            : `${(Number(dustConfig.bps) / 100).toFixed(2)}% Fixed Tax`
        : '—';

    const lockLabel = dustConfig && dustConfig.lockBlocks === 0n
        ? 'Unlocked (withdraw anytime)'
        : dustConfig && dustConfig.lockBlocks > 0n
            ? `${dustConfig.lockBlocks.toLocaleString()} blocks lock`
            : '—';

    const balance = position?.balance ?? 0n;
    const unlockBlock = position?.unlockBlock ?? 0n;
    const depositCount = position?.depositCount ?? 0n;

    // Progress bar: how much of the lock has elapsed
    let lockProgress = 0;
    if (dustConfig && dustConfig.lockBlocks > 0n && balance > 0n) {
        const elapsed = BigInt(currentBlock) - (unlockBlock - dustConfig.lockBlocks);
        lockProgress = Math.min(100, Math.max(0, Number((elapsed * 100n) / dustConfig.lockBlocks)));
    } else if (canWithdraw && balance > 0n) {
        lockProgress = 100;
    }

    // Estimated unlock date/time
    const estimatedUnlockStr = (() => {
        if (blocksRemaining <= 0n || canWithdraw) return null;
        const secondsRemaining = Number(blocksRemaining) * (240); // 4 min blocks
        const unlockDate = new Date(Date.now() + secondsRemaining * 1000);
        return unlockDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    })();

    return (
        <div
            className="min-h-screen px-4 py-8"
            style={{ background: '#030712' }}
        >
            <div className="max-w-2xl mx-auto">

                {/* Hero image */}
                <div className="relative mb-8 rounded-xl overflow-hidden h-36" style={{ background: '#0f172a' }}>
                    <img
                        src="./piggy-cyber.png"
                        alt="SatStash Vault"
                        className="w-full h-full object-cover"
                        style={{ filter: 'brightness(0.7) saturate(1.2)' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div
                        className="absolute inset-0 flex items-center justify-between px-6"
                        style={{ background: 'linear-gradient(90deg, rgba(3,7,18,0.95) 40%, transparent)' }}
                    >
                        <div>
                            <h1
                                className="text-3xl font-bold tracking-widest"
                                style={{ color: '#4ade80', fontFamily: 'Courier New, monospace', textShadow: '0 0 20px rgba(74,222,128,0.5)' }}
                            >
                                Your Stash
                            </h1>
                            <p className="text-xs tracking-wider mt-1" style={{ color: '#9ca3af' }}>
                                {dustModeLabel} &bull; {lockLabel}
                            </p>
                        </div>
                        <img
                            src="/favicon.svg"
                            alt="SatStash"
                            style={{ width: '100px', height: '100px', opacity: 0.9, filter: 'drop-shadow(0 0 12px rgba(74,222,128,0.4))' }}
                        />
                    </div>
                </div>

                {/* Balance card */}
                <div
                    className="rounded-xl p-6 mb-4"
                    style={{ background: '#0f172a', border: '1px solid rgba(74,222,128,0.2)' }}
                >
                    <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#9ca3af' }}>
                        Total Locked
                    </p>
                    <p
                        className="text-5xl font-bold font-mono mb-1"
                        style={{
                            color: '#4ade80',
                            textShadow: '0 0 20px rgba(74,222,128,0.3)',
                            fontFamily: 'Courier New, monospace',
                        }}
                    >
                        {loading ? '...' : formatToken(balance)}
                    </p>
                    <p className="text-sm" style={{ color: '#9ca3af' }}>$PIGGY</p>

                    {/* Progress bar */}
                    {balance > 0n && (
                        <div className="mt-4">
                            <div className="flex justify-between text-xs mb-1" style={{ color: '#9ca3af' }}>
                                <span>{canWithdraw ? 'UNLOCKED' : `${blocksRemaining.toLocaleString()} blocks remaining`}</span>
                                <span>{blocksToTime(blocksRemaining)}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                        width: `${lockProgress}%`,
                                        background: canWithdraw
                                            ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
                                            : 'linear-gradient(90deg, #f7931a, #f59e0b)',
                                    }}
                                />
                            </div>
                            {!canWithdraw && estimatedUnlockStr && (
                                <div className="flex justify-between text-xs mt-2" style={{ color: '#9ca3af' }}>
                                    <span>Unlocks at block <span className="font-mono" style={{ color: '#e2e8f0' }}>#{unlockBlock.toLocaleString()}</span></span>
                                    <span style={{ color: '#f7931a' }}>{estimatedUnlockStr}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                    <div
                        className="rounded-xl p-4"
                        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>Deposits</p>
                        <p className="text-xl font-bold font-mono" style={{ color: '#e2e8f0' }}>
                            {depositCount.toString()}
                        </p>
                    </div>
                    <div
                        className="rounded-xl p-4"
                        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>Unlock Block</p>
                        <p className="text-xl font-bold font-mono" style={{ color: '#e2e8f0' }}>
                            {balance > 0n ? unlockBlock.toLocaleString() : '—'}
                        </p>
                    </div>
                    <div
                        className="rounded-xl p-4"
                        style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#9ca3af' }}>TVL</p>
                        <p className="text-xl font-bold font-mono" style={{ color: '#e2e8f0' }}>
                            {formatToken(totalLocked).split('.')[0]}
                        </p>
                    </div>
                </div>

                {/* Vault config card */}
                <div
                    className="rounded-xl p-5 mb-4"
                    style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#9ca3af' }}>Config</p>
                    <div className="flex justify-between text-sm mb-2">
                        <span style={{ color: '#9ca3af' }}>Strategy</span>
                        <span style={{ color: '#e2e8f0' }}>{dustModeLabel}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span style={{ color: '#9ca3af' }}>Lock Period</span>
                        <span style={{ color: '#e2e8f0' }}>{lockLabel}</span>
                    </div>
                    <div className="flex justify-between text-sm mt-2">
                        <span style={{ color: '#9ca3af' }}>Current Block</span>
                        <span className="font-mono" style={{ color: '#9ca3af' }}>#{currentBlock.toLocaleString()}</span>
                    </div>
                </div>

                {/* Withdraw button */}
                <button
                    onClick={() => { void handleWithdraw(); }}
                    disabled={!canWithdraw || balance === 0n || isWithdrawing || !!pendingTxId}
                    className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-300"
                    style={{
                        background: canWithdraw && balance > 0n && !isWithdrawing && !pendingTxId
                            ? 'linear-gradient(135deg, #f7931a, #f59e0b)'
                            : 'rgba(255,255,255,0.05)',
                        color: canWithdraw && balance > 0n && !isWithdrawing && !pendingTxId ? '#000' : '#9ca3af',
                        cursor: canWithdraw && balance > 0n && !isWithdrawing && !pendingTxId ? 'pointer' : 'not-allowed',
                        border: canWithdraw && balance > 0n && !isWithdrawing && !pendingTxId ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        boxShadow: canWithdraw && balance > 0n && !isWithdrawing && !pendingTxId ? '0 0 20px rgba(247,147,26,0.3)' : 'none',
                        fontFamily: 'Courier New, monospace',
                    }}
                >
                    {isWithdrawing ? (
                        <><span className="spinner" />Withdrawing...</>
                    ) : pendingTxId ? (
                        <><span className="spinner" />Confirming on-chain...</>
                    ) : !canWithdraw && balance > 0n
                        ? `Locked · ${blocksRemaining.toLocaleString()} blocks`
                        : balance === 0n
                            ? 'No Position'
                            : 'Withdraw Stash'
                    }
                </button>
            </div>
        </div>
    );
}
