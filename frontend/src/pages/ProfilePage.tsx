import { Network } from '@btc-vision/bitcoin';
import type { Position, DustConfig } from '../hooks/usePiggyBankData';
import { getContractAddress } from '../config/contracts';

interface ProfilePageProps {
    readonly walletAddress: string | null | undefined;
    readonly network: Network | null | undefined;
    readonly bankBalance: bigint;
    readonly piggyBalance: bigint;
    readonly position: Position | null;
    readonly dustConfig: DustConfig | null;
    readonly totalLocked: bigint;
    readonly blocksRemaining: bigint;
    readonly currentBlock: number;
}

const UNIT = 10n ** 8n;

function formatToken(amount: bigint, decimals = 2): string {
    const whole = amount / UNIT;
    const frac = amount % UNIT;
    return `${whole.toLocaleString()},${frac.toString().padStart(8, '0').slice(0, decimals)}`;
}

function Row({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span className="text-xs uppercase tracking-widest" style={{ color: '#6b7280' }}>{label}</span>
            <span
                className="text-xs font-bold"
                style={{ color: '#e2e8f0', fontFamily: mono ? 'Courier New, monospace' : undefined }}
            >
                {value}
            </span>
        </div>
    );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl p-5 mb-4" style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(74,222,128,0.15)' }}>
            <p className="text-xs uppercase tracking-widest mb-3 font-bold" style={{ color: '#4ade80' }}>{title}</p>
            {children}
        </div>
    );
}

export function ProfilePage({
    walletAddress,
    network,
    bankBalance,
    piggyBalance,
    position,
    dustConfig,
    totalLocked,
    blocksRemaining,
    currentBlock,
}: ProfilePageProps) {
    const bankAddr  = network ? getContractAddress('bankToken', network)  : '—';
    const piggyAddr = network ? getContractAddress('piggyBank', network)  : '—';
    const poolAddr  = network ? getContractAddress('pool', network)       : '—';

    const modeLabel = !dustConfig || dustConfig.mode === 0n
        ? 'No vault'
        : dustConfig.mode === 1n
            ? 'Round-Up Dust'
            : `Fixed ${(Number(dustConfig.bps) / 100).toFixed(2)}%`;

    const lockLabel = dustConfig && dustConfig.lockBlocks > 0n
        ? `${dustConfig.lockBlocks.toLocaleString()} blocks (~${Math.round(Number(dustConfig.lockBlocks) * 4 / 60 / 24)} days)`
        : '—';

    const unlockLabel = position && position.unlockBlock > 0n
        ? position.unlockBlock <= BigInt(currentBlock)
            ? 'Unlocked'
            : `Block ${position.unlockBlock.toLocaleString()} (${blocksRemaining.toLocaleString()} to go)`
        : '—';

    return (
        <div className="min-h-screen px-4 py-8" style={{ background: '#030712' }}>
            <div className="max-w-xl mx-auto">

                {/* Header */}
                <div className="mb-6">
                    <h1
                        className="text-2xl font-bold tracking-widest uppercase mb-1"
                        style={{ color: '#4ade80', fontFamily: 'Courier New, monospace', textShadow: '0 0 10px rgba(74,222,128,0.4)' }}
                    >
                        Profile
                    </h1>
                    <p className="text-xs tracking-wider" style={{ color: '#9ca3af' }}>
                        Wallet info, vault config &amp; contract addresses
                    </p>
                </div>

                {/* Wallet */}
                <Card title="Wallet">
                    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <span className="text-xs uppercase tracking-widest" style={{ color: '#6b7280' }}>Address</span>
                        <span className="text-xs font-bold break-all" style={{ color: '#e2e8f0', fontFamily: 'Courier New, monospace', maxWidth: '70%', textAlign: 'right' }}>
                            {walletAddress ?? '—'}
                        </span>
                    </div>
                    <Row label="$BANK Balance"  value={`${formatToken(bankBalance)} BANK`}  />
                    <Row label="$PIGGY Balance" value={`${formatToken(piggyBalance)} PIGGY`} />
                </Card>

                {/* Vault Config */}
                <Card title="Vault Configuration">
                    <Row label="Dust Mode"    value={modeLabel} />
                    <Row label="Lock Period"  value={lockLabel} />
                    <Row label="Deposits"     value={position ? position.depositCount.toLocaleString() : '0'} />
                </Card>

                {/* Vault Position */}
                <Card title="Vault Position">
                    <Row label="Locked PIGGY"   value={position ? `${formatToken(position.balance)} PIGGY` : '0 PIGGY'} />
                    <Row label="Total Locked"    value={`${formatToken(totalLocked)} PIGGY`} />
                    <Row label="Unlock Block"    value={unlockLabel} />
                    <Row label="Current Block"   value={currentBlock.toLocaleString()} />
                </Card>

                {/* Contracts */}
                <Card title="Contract Addresses">
                    {[
                        { label: 'BankToken',    addr: bankAddr },
                        { label: 'PiggyBank',    addr: piggyAddr },
                        { label: 'SatStashPool', addr: poolAddr },
                    ].map(({ label, addr }) => (
                        <div
                            key={label}
                            className="flex items-center justify-between py-3"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                        >
                            <span className="text-xs uppercase tracking-widest" style={{ color: '#6b7280' }}>{label}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                                    {addr ? `${addr.slice(0, 10)}...${addr.slice(-6)}` : '—'}
                                </span>
                                <button
                                    onClick={() => void navigator.clipboard.writeText(addr ?? '')}
                                    title="Copy address"
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid rgba(74,222,128,0.2)',
                                        borderRadius: '4px',
                                        color: '#4ade80',
                                        cursor: 'pointer',
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        fontFamily: 'Courier New, monospace',
                                    }}
                                >
                                    Copy
                                </button>
                            </div>
                        </div>
                    ))}
                </Card>

                {/* Network */}
                <Card title="Network">
                    <Row label="Network"  value="OPNet Testnet (Signet)" />
                    <Row label="RPC"      value="testnet.opnet.org" />
                    <Row label="Block ~"  value="4 min / block" />
                </Card>

            </div>
        </div>
    );
}
