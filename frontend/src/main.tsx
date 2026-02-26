import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { WalletConnectProvider } from '@btc-vision/walletconnect';
import { App } from './App';
import './index.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#ff4d6a', background: '#0a0b0f', minHeight: '100vh' }}>
                    <h2 style={{ marginBottom: '1rem' }}>Runtime Error</h2>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', color: '#ffb020' }}>
                        {this.state.error.message}
                        {'\n\n'}
                        {this.state.error.stack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ErrorBoundary>
            <WalletConnectProvider theme="dark">
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
            </WalletConnectProvider>
        </ErrorBoundary>
    </StrictMode>,
);
