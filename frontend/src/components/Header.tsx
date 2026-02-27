import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { BlockInfoBar } from './BlockInfoBar';

interface HeaderProps {
    readonly hasVault?: boolean;
}

export function Header({ hasVault = false }: HeaderProps) {
    const { walletAddress, connectToWallet, disconnect } = useWalletConnect();
    const [showMenu, setShowMenu] = useState(false);

    const shortAddr = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : null;

    return (
        <header className="sticky top-0 z-50 backdrop-blur-md border-b"
            style={{ background: 'rgba(3,7,18,0.92)', borderColor: 'rgba(74,222,128,0.15)' }}
        >
            <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

                {/* Left: Logo */}
                <NavLink to="/" className="flex items-center gap-2 flex-shrink-0" style={{ textDecoration: 'none' }}>
                    <img
                        src="/favicon.svg"
                        alt="SatStash"
                        style={{ width: '32px', height: '32px', display: 'block' }}
                    />
                    <span
                        style={{ color: '#4ade80', textShadow: '0 0 10px rgba(74,222,128,0.5)', fontFamily: 'Courier New, monospace', fontSize: '20px', fontWeight: 700, letterSpacing: '0.05em' }}
                    >
                        SatStash
                    </span>
                </NavLink>

                {/* Center: Navigation (only when wallet + vault) */}
                {walletAddress && hasVault && (
                    <nav className="flex items-center gap-1">
                        <NavLink to="/swap"
                            style={({ isActive }) => ({
                                padding: '6px 16px',
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                textDecoration: 'none',
                                borderBottom: isActive ? '2px solid #4ade80' : '2px solid transparent',
                                color: isActive ? '#4ade80' : '#9ca3af',
                                fontFamily: 'Courier New, monospace',
                                transition: 'all 0.2s',
                            })}
                        >
                            💱 Terminal
                        </NavLink>
                        <NavLink to="/vault"
                            style={({ isActive }) => ({
                                padding: '6px 16px',
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                textDecoration: 'none',
                                borderBottom: isActive ? '2px solid #4ade80' : '2px solid transparent',
                                color: isActive ? '#4ade80' : '#9ca3af',
                                fontFamily: 'Courier New, monospace',
                                transition: 'all 0.2s',
                            })}
                        >
                            <img src="/favicon.svg" alt="" style={{ width: '16px', height: '16px', display: 'inline-block', verticalAlign: 'middle', marginRight: '5px' }} />
                            SatStash
                        </NavLink>
                    </nav>
                )}

                {/* Right: Block info + Wallet */}
                <div className="flex items-center gap-2 flex-shrink-0 relative">
                    {walletAddress && <BlockInfoBar />}
                    {shortAddr ? (
                        <>
                            <button
                                onClick={() => setShowMenu(v => !v)}
                                className="font-mono text-xs px-3 py-1.5 rounded-lg border transition-all"
                                style={{
                                    color: '#4ade80',
                                    borderColor: 'rgba(74,222,128,0.3)',
                                    background: 'rgba(74,222,128,0.05)',
                                    cursor: 'pointer',
                                    fontFamily: 'Courier New, monospace',
                                }}
                            >
                                {shortAddr} ▾
                            </button>
                            {showMenu && (
                                <div
                                    className="absolute top-full right-0 mt-1 rounded-lg overflow-hidden"
                                    style={{
                                        background: '#0f172a',
                                        border: '1px solid rgba(74,222,128,0.2)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                        minWidth: '160px',
                                        zIndex: 100,
                                    }}
                                >
                                    <div className="px-3 py-2 text-xs" style={{ color: '#9ca3af', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: 'Courier New, monospace' }}>
                                        {walletAddress?.slice(0, 12)}...
                                    </div>
                                    <button
                                        onClick={() => { disconnect(); setShowMenu(false); }}
                                        className="w-full text-left px-3 py-2 text-xs font-bold transition-all"
                                        style={{
                                            color: '#f87171',
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontFamily: 'Courier New, monospace',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            )}
                            {/* Click outside to close */}
                            {showMenu && (
                                <div
                                    className="fixed inset-0"
                                    style={{ zIndex: 99 }}
                                    onClick={() => setShowMenu(false)}
                                />
                            )}
                        </>
                    ) : (
                        <button
                            onClick={() => { connectToWallet(SupportedWallets.OP_WALLET); }}
                            className="text-xs px-4 py-1.5 rounded-lg font-bold tracking-wider transition-all"
                            style={{
                                color: '#4ade80',
                                border: '1px solid rgba(74,222,128,0.4)',
                                background: 'rgba(74,222,128,0.05)',
                                cursor: 'pointer',
                                fontFamily: 'Courier New, monospace',
                            }}
                        >
                            Connect Wallet
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
}
