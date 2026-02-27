import { useWalletConnect, SupportedWallets } from '@btc-vision/walletconnect';

export function LandingPage() {
    const { connectToWallet } = useWalletConnect();

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center gap-8 px-4 text-center"
            style={{ background: '#030712' }}
        >
            {/* Logo */}
            <img
                src="/favicon.svg"
                alt="SatStash"
                style={{ width: '160px', height: '160px', filter: 'drop-shadow(0 0 30px rgba(74,222,128,0.4))' }}
            />

            {/* Title */}
            <div>
                <h1
                    className="text-6xl font-bold tracking-widest mb-3"
                    style={{
                        color: '#4ade80',
                        textShadow: '0 0 20px rgba(74,222,128,0.6), 0 0 60px rgba(74,222,128,0.2)',
                        fontFamily: 'Courier New, monospace',
                    }}
                >
                    SatStash
                </h1>
                <p
                    className="text-lg tracking-wider uppercase"
                    style={{ color: '#9ca3af', fontFamily: 'Courier New, monospace' }}
                >
                    Stack Sats. Automate Savings.
                </p>
            </div>

            {/* Description */}
            <p
                className="max-w-md text-sm leading-relaxed"
                style={{ color: '#9ca3af' }}
            >
                Every swap, a piece of your profits gets stashed. Time-locked or instant — you choose.
                Powered by OPNet on Bitcoin L1.
            </p>

            {/* Connect button */}
            <button
                onClick={() => { connectToWallet(SupportedWallets.OP_WALLET); }}
                className="px-10 py-4 text-base font-bold tracking-widest uppercase rounded-xl transition-all duration-300 hover:scale-105"
                style={{
                    background: 'linear-gradient(135deg, #f7931a, #f59e0b)',
                    color: '#000',
                    boxShadow: '0 0 30px rgba(247,147,26,0.4)',
                    fontFamily: 'Courier New, monospace',
                }}
            >
                Connect Wallet
            </button>

            {/* Footer note */}
            <p
                className="text-xs tracking-wider"
                style={{ color: '#9ca3af' }}
            >
                OPNet Testnet &bull; OP_WALLET Required
            </p>
        </div>
    );
}
