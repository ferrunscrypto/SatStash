import { useState } from 'react';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { usePiggyBankContract } from '../hooks/usePiggyBank';

interface VaultSetupPageProps {
    readonly walletAddress: string | null | undefined;
    readonly resolvedAddress: Address | null | undefined;
    readonly network: Network | null | undefined;
    readonly onSuccess: () => void;
}

const LOCK_PRESETS = [
    { label: '1K', blocks: 1_000n, days: '~7 days' },
    { label: '5K', blocks: 5_000n, days: '~35 days' },
    { label: '10K', blocks: 10_000n, days: '~69 days' },
    { label: '26K', blocks: 26_280n, days: '~6 months' },
];

export function VaultSetupPage({ walletAddress, resolvedAddress, network, onSuccess }: VaultSetupPageProps) {
    const piggyContract = usePiggyBankContract(network, resolvedAddress ?? undefined);

    const [strategy, setStrategy] = useState<1 | 2>(1);
    const [bps, setBps] = useState(100);
    const [lockMode, setLockMode] = useState<'locked' | 'unlocked'>('locked');
    const [selectedPreset, setSelectedPreset] = useState<bigint | 'custom'>(1_000n);
    const [customBlocks, setCustomBlocks] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const lockBlocks: bigint = lockMode === 'unlocked'
        ? 0n
        : selectedPreset === 'custom'
            ? BigInt(customBlocks || '0')
            : selectedPreset;

    async function handleSubmit() {
        if (!walletAddress || !piggyContract) {
            setError('Wallet not connected or contract unavailable');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const modeArg = strategy;
            const bpsArg  = strategy === 2 ? bps : 0;

            const sim = await piggyContract.createVault(modeArg, bpsArg, lockBlocks) as {
                revert?: string | null;
                sendTransaction: (p: unknown) => Promise<unknown>;
            };

            if (sim.revert) {
                throw new Error(`Contract revert: ${sim.revert}`);
            }

            await sim.sendTransaction({
                signer: null,
                mldsaSigner: null,
                refundTo: walletAddress,
                maximumAllowedSatToSpend: 100_000n,
                feeRate: 10,
                network: network!,
            });

            onSuccess();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Transaction failed';
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    }

    const bpsPercent = (bps / 100).toFixed(2);

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-start pt-12 px-4"
            style={{ background: '#030712' }}
        >
            {/* Small piggy */}
            <img
                src="./piggy-cyber.png"
                alt="SatStash"
                className="w-24 h-24 object-contain mb-6 rounded-xl"
                style={{ filter: 'drop-shadow(0 0 15px rgba(74,222,128,0.4))' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />

            <div
                className="w-full max-w-md rounded-xl p-6"
                style={{
                    background: '#0f172a',
                    border: '1px solid rgba(74,222,128,0.2)',
                    boxShadow: '0 0 40px rgba(74,222,128,0.05)',
                }}
            >
                <h2
                    className="text-xl font-bold tracking-wider mb-6"
                    style={{ color: '#4ade80', fontFamily: 'Courier New, monospace' }}
                >
                    Configure Your Stash
                </h2>

                {/* Strategy */}
                <div className="mb-6">
                    <label className="block text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#6b7280' }}>
                        Strategy
                    </label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setStrategy(1)}
                            className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                            style={{
                                background: strategy === 1 ? 'rgba(74,222,128,0.15)' : 'transparent',
                                border: strategy === 1 ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                color: strategy === 1 ? '#4ade80' : '#6b7280',
                                cursor: 'pointer',
                            }}
                        >
                            Round-Up Dust
                        </button>
                        <button
                            onClick={() => setStrategy(2)}
                            className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                            style={{
                                background: strategy === 2 ? 'rgba(74,222,128,0.15)' : 'transparent',
                                border: strategy === 2 ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                color: strategy === 2 ? '#4ade80' : '#6b7280',
                                cursor: 'pointer',
                            }}
                        >
                            Fixed % Tax
                        </button>
                    </div>
                    {strategy === 2 && (
                        <div className="mt-3">
                            <div className="flex items-center gap-3">
                                <input
                                    type="range"
                                    min="1"
                                    max="1000"
                                    value={bps}
                                    onChange={(e) => setBps(Number(e.target.value))}
                                    className="flex-1"
                                    style={{ accentColor: '#4ade80' }}
                                />
                                <span
                                    className="text-sm font-bold font-mono w-16 text-right"
                                    style={{ color: '#4ade80' }}
                                >
                                    {bpsPercent}%
                                </span>
                            </div>
                            <p className="text-xs mt-1" style={{ color: '#4b5563' }}>
                                {bps} bps — {bpsPercent}% of each swap goes to vault
                            </p>
                        </div>
                    )}
                </div>

                {/* Lock Mode */}
                <div className="mb-6">
                    <label className="block text-xs font-bold tracking-widest uppercase mb-3" style={{ color: '#6b7280' }}>
                        Lock Mode
                    </label>
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={() => setLockMode('locked')}
                            className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                            style={{
                                background: lockMode === 'locked' ? 'rgba(247,147,26,0.15)' : 'transparent',
                                border: lockMode === 'locked' ? '1px solid rgba(247,147,26,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                color: lockMode === 'locked' ? '#f7931a' : '#6b7280',
                                cursor: 'pointer',
                            }}
                        >
                            Time-Locked
                        </button>
                        <button
                            onClick={() => setLockMode('unlocked')}
                            className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                            style={{
                                background: lockMode === 'unlocked' ? 'rgba(74,222,128,0.15)' : 'transparent',
                                border: lockMode === 'unlocked' ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                color: lockMode === 'unlocked' ? '#4ade80' : '#6b7280',
                                cursor: 'pointer',
                            }}
                        >
                            Unlocked
                        </button>
                    </div>

                    {lockMode === 'locked' && (
                        <>
                            <div className="flex gap-2 flex-wrap mb-3">
                                {LOCK_PRESETS.map((p) => (
                                    <button
                                        key={p.label}
                                        onClick={() => setSelectedPreset(p.blocks)}
                                        className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                                        style={{
                                            background: selectedPreset === p.blocks ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
                                            border: selectedPreset === p.blocks ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                            color: selectedPreset === p.blocks ? '#4ade80' : '#6b7280',
                                            cursor: 'pointer',
                                        }}
                                        title={p.days}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setSelectedPreset('custom')}
                                    className="px-3 py-1 rounded-full text-xs font-bold transition-all"
                                    style={{
                                        background: selectedPreset === 'custom' ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
                                        border: selectedPreset === 'custom' ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.1)',
                                        color: selectedPreset === 'custom' ? '#4ade80' : '#6b7280',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Custom
                                </button>
                            </div>
                            {selectedPreset === 'custom' && (
                                <input
                                    type="number"
                                    placeholder="blocks (max 52560)"
                                    value={customBlocks}
                                    onChange={(e) => setCustomBlocks(e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg text-sm font-mono"
                                    style={{
                                        background: '#030712',
                                        border: '1px solid rgba(74,222,128,0.3)',
                                        color: '#e2e8f0',
                                        outline: 'none',
                                    }}
                                />
                            )}
                            <p className="text-xs mt-2" style={{ color: '#4b5563' }}>
                                {lockBlocks > 0n
                                    ? `~${Math.round(Number(lockBlocks) / 6 / 24)} days at 6 blocks/hr`
                                    : 'Enter blocks above'
                                }
                            </p>
                        </>
                    )}

                    {lockMode === 'unlocked' && (
                        <p className="text-xs p-3 rounded-lg" style={{ color: '#4ade80', background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}>
                            Withdraw anytime — no time restriction on your stash
                        </p>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div
                        className="mb-4 p-3 rounded-lg text-xs"
                        style={{ background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
                    >
                        {error}
                    </div>
                )}

                {/* Submit */}
                <button
                    onClick={() => { void handleSubmit(); }}
                    disabled={submitting || !walletAddress}
                    className="w-full py-4 rounded-xl font-bold text-sm tracking-widest uppercase transition-all duration-300"
                    style={{
                        background: submitting || !walletAddress
                            ? 'rgba(247,147,26,0.3)'
                            : 'linear-gradient(135deg, #f7931a, #f59e0b)',
                        color: submitting || !walletAddress ? '#6b7280' : '#000',
                        cursor: submitting || !walletAddress ? 'not-allowed' : 'pointer',
                        boxShadow: submitting || !walletAddress ? 'none' : '0 0 20px rgba(247,147,26,0.3)',
                        fontFamily: 'Courier New, monospace',
                    }}
                >
                    {submitting ? (
                        <><span className="spinner" />Initializing...</>
                    ) : (
                        'Initialize Stash'
                    )}
                </button>
            </div>
        </div>
    );
}
