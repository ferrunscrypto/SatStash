import { useWalletConnect } from '@btc-vision/walletconnect';
import { useBlockInfo, AVG_BLOCK_SECONDS } from '../hooks/useBlockInfo';

function getNetworkMeta(walletNetwork: string | null | undefined) {
    const raw = (walletNetwork ?? import.meta.env['VITE_NETWORK'] ?? 'regtest').toLowerCase();
    if (raw === 'mainnet' || raw === 'livenet' || raw === 'bitcoin')
        return { label: 'Mainnet', color: '#22c55e' };
    if (raw === 'testnet' || raw === 'signet' || raw === 'opnettestnet')
        return { label: 'OPNet Testnet', color: '#f7931a' };
    return { label: 'Regtest', color: '#f59e0b' };
}

export function BlockInfoBar() {
    const { network: walletNetwork } = useWalletConnect();
    const { blockNumber, secondsSinceBlock, loading } = useBlockInfo();
    const { label, color } = getNetworkMeta(walletNetwork?.network);

    const secondsUntilNext = Math.max(0, AVG_BLOCK_SECONDS - secondsSinceBlock);
    const mm = Math.floor(secondsUntilNext / 60).toString().padStart(2, '0');
    const ss = (secondsUntilNext % 60).toString().padStart(2, '0');

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                height: '36px',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '8px',
                background: '#0f172a',
                overflow: 'hidden',
                userSelect: 'none',
                flexShrink: 0,
                gap: 0,
            }}
        >
            {/* Network */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px 0 10px', height: '100%' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, boxShadow: `0 0 6px ${color}99`, flexShrink: 0, display: 'inline-block' }} />
                <span style={{ fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: '11px', color, letterSpacing: '0.04em' }}>
                    {label}
                </span>
            </div>

            <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }} />

            {/* Block */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: '1px' }}>
                <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Block</span>
                <span style={{ fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: '12px', color: '#e2e8f0' }}>
                    {loading ? '···' : `#${blockNumber.toLocaleString()}`}
                </span>
            </div>

            <div style={{ width: '1px', background: 'rgba(255,255,255,0.07)', alignSelf: 'stretch' }} />

            {/* Next block countdown */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 12px', gap: '1px' }}>
                <span style={{ color: '#9ca3af', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Next</span>
                <span style={{ fontFamily: 'Courier New, monospace', fontWeight: 700, fontSize: '12px', color: loading ? '#9ca3af' : '#4ade80' }}>
                    {loading ? '···' : `${mm}:${ss}`}
                </span>
            </div>
        </div>
    );
}
