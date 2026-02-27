import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';
import { BlockInfoBar } from './BlockInfoBar';

interface HeaderProps {
    readonly hasVault?: boolean;
}

const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 18px',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    borderRadius: '8px',
    fontFamily: 'Courier New, monospace',
    transition: 'all 0.18s',
    background: isActive ? 'rgba(74,222,128,0.12)' : 'transparent',
    color: isActive ? '#4ade80' : '#9ca3af',
    border: isActive ? '1px solid rgba(74,222,128,0.3)' : '1px solid transparent',
    boxShadow: isActive ? '0 0 12px rgba(74,222,128,0.12)' : 'none',
});

export function Header({ hasVault = false }: HeaderProps) {
    const { walletAddress, connectToWallet, disconnect } = useWalletConnect();
    const [showMenu, setShowMenu] = useState(false);

    const shortAddr = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : null;

    return (
        <header
            className="sticky top-0 z-50 backdrop-blur-md border-b"
            style={{ background: 'rgba(3,7,18,0.92)', borderColor: 'rgba(74,222,128,0.15)' }}
        >
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

                {/* Left: Logo */}
                <NavLink to="/" className="flex items-center gap-2 flex-shrink-0" style={{ textDecoration: 'none' }}>
                    <img
                        src="/favicon.svg"
                        alt="SatStash"
                        style={{ width: '34px', height: '34px', display: 'block' }}
                    />
                    <span
                        style={{
                            color: '#4ade80',
                            textShadow: '0 0 10px rgba(74,222,128,0.5)',
                            fontFamily: 'Courier New, monospace',
                            fontSize: '22px',
                            fontWeight: 700,
                            letterSpacing: '0.05em',
                        }}
                    >
                        SatStash
                    </span>
                </NavLink>

                {/* Center: Navigation */}
                {walletAddress && hasVault && (
                    <nav className="flex items-center gap-2">
                        <NavLink to="/swap" style={navLinkStyle}>
                            ⚡ Terminal
                        </NavLink>
                        <NavLink to="/vault" style={navLinkStyle}>
                            <img src="/favicon.svg" alt="" style={{ width: '14px', height: '14px' }} />
                            Vault
                        </NavLink>
                        <NavLink to="/profile" style={navLinkStyle}>
                            ◎ Profile
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
                                className="font-mono text-xs px-3 py-2 rounded-lg border transition-all"
                                style={{
                                    color: '#4ade80',
                                    borderColor: 'rgba(74,222,128,0.3)',
                                    background: 'rgba(74,222,128,0.05)',
                                    cursor: 'pointer',
                                    fontFamily: 'Courier New, monospace',
                                    fontSize: '13px',
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
                                        minWidth: '180px',
                                        zIndex: 100,
                                    }}
                                >
                                    <div
                                        className="px-4 py-2 text-xs"
                                        style={{ color: '#9ca3af', borderBottom: '1px solid rgba(255,255,255,0.05)', fontFamily: 'Courier New, monospace' }}
                                    >
                                        {walletAddress?.slice(0, 14)}...
                                    </div>
                                    <button
                                        onClick={() => { disconnect(); setShowMenu(false); }}
                                        className="w-full text-left px-4 py-2.5 text-xs font-bold transition-all"
                                        style={{
                                            color: '#f87171',
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontFamily: 'Courier New, monospace',
                                            fontSize: '13px',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(248,113,113,0.08)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            )}

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
                            className="text-xs px-4 py-2 rounded-lg font-bold tracking-wider transition-all"
                            style={{
                                color: '#4ade80',
                                border: '1px solid rgba(74,222,128,0.4)',
                                background: 'rgba(74,222,128,0.05)',
                                cursor: 'pointer',
                                fontFamily: 'Courier New, monospace',
                                fontSize: '13px',
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
