import { useState, useCallback, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useWalletConnect } from '@btc-vision/walletconnect';
import { Address } from '@btc-vision/transaction';
import { Header } from './components/Header';
import { LandingPage } from './pages/LandingPage';
import { VaultSetupPage } from './pages/VaultSetupPage';
import { SwapTerminal } from './pages/SwapTerminal';
import { VaultDashboard } from './pages/VaultDashboard';
import { usePiggyBankData } from './hooks/usePiggyBankData';

function AppInner() {
    const { network, walletAddress } = useWalletConnect();

    const resolvedAddressRef = useRef<Address | null>(null);
    const [resolvedAddress, setResolvedAddress] = useState<Address | null>(null);

    const resolveAddr = useCallback(async () => {
        if (!walletAddress || !network) return;
        if (resolvedAddressRef.current) return;
        try {
            const { Address: BTCAddress } = await import('@btc-vision/transaction');
            const { JSONRpcProvider } = await import('opnet');
            const { getRpcUrl } = await import('./config/networks');
            const provider = new JSONRpcProvider({ url: getRpcUrl(network), network });
            const raw = await provider.getPublicKeysInfoRaw(walletAddress);
            const keys = Object.keys(raw);
            const firstKey = keys[0];
            if (!firstKey) return;
            const info = (raw as Record<string, Record<string, string>>)[walletAddress] ?? (raw as Record<string, Record<string, string>>)[firstKey];
            if (!info || 'error' in info) return;
            const primaryKey = (info['mldsaHashedPublicKey'] ?? info['tweakedPubkey']) as string;
            const legacyKey  = (info['originalPubKey'] ?? info['tweakedPubkey']) as string;
            if (!primaryKey) return;
            const addr = BTCAddress.fromString(primaryKey, legacyKey);
            resolvedAddressRef.current = addr;
            setResolvedAddress(addr);
        } catch (e) {
            console.error('[App] Failed to resolve address:', e);
        }
    }, [walletAddress, network]);

    useEffect(() => { void resolveAddr(); }, [resolveAddr]);

    const data = usePiggyBankData(walletAddress, resolvedAddress, network);

    // Vault exists when dustConfig.mode > 0 (mode is 1 or 2 when configured)
    const hasVault = !!(data.dustConfig && data.dustConfig.mode > 0n);

    // Not connected: show landing page
    if (!walletAddress) {
        return (
            <>
                <Header />
                <LandingPage />
            </>
        );
    }

    // Connected, no vault: vault setup
    if (!hasVault) {
        return (
            <>
                <Header />
                <Routes>
                    <Route
                        path="/vault/setup"
                        element={
                            <VaultSetupPage
                                walletAddress={walletAddress}
                                resolvedAddress={resolvedAddress}
                                network={network ?? null}
                                onSuccess={() => void data.refresh()}
                            />
                        }
                    />
                    <Route path="*" element={<Navigate to="/vault/setup" replace />} />
                </Routes>
            </>
        );
    }

    // Connected + vault: main app
    return (
        <>
            <Header hasVault={hasVault} />
            <Routes>
                <Route
                    path="/swap"
                    element={
                        <SwapTerminal
                            walletAddress={walletAddress}
                            resolvedAddress={resolvedAddress}
                            network={network ?? null}
                            bankBalance={data.bankBalance}
                            piggyBalance={data.piggyBalance}
                            dustConfig={data.dustConfig}
                            onSuccess={() => void data.refresh()}
                        />
                    }
                />
                <Route
                    path="/vault"
                    element={
                        <VaultDashboard
                            walletAddress={walletAddress}
                            resolvedAddress={resolvedAddress}
                            network={network ?? null}
                            position={data.position}
                            dustConfig={data.dustConfig}
                            canWithdraw={data.canWithdraw}
                            blocksRemaining={data.blocksRemaining}
                            currentBlock={data.currentBlock}
                            totalLocked={data.totalLocked}
                            loading={data.loading}
                            onSuccess={() => void data.refresh()}
                        />
                    }
                />
                {/* Default redirect to swap terminal */}
                <Route path="/" element={<Navigate to="/swap" replace />} />
                <Route path="*" element={<Navigate to="/swap" replace />} />
            </Routes>
        </>
    );
}

export function App() {
    return (
        <HashRouter>
            <AppInner />
        </HashRouter>
    );
}
