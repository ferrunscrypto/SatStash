import { useState, useCallback, useEffect } from 'react';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { useBankTokenContract, usePiggyBankContract } from '../hooks/usePiggyBank';
import { getContractAddress } from '../config/contracts';

interface SwapTerminalProps {
    readonly walletAddress: string | null | undefined;
    readonly resolvedAddress: Address | null | undefined;
    readonly network: Network | null | undefined;
    readonly bankBalance: bigint;
    readonly piggyBalance: bigint;
    readonly dustConfig: { mode: bigint; bps: bigint; lockBlocks: bigint } | null;
    readonly onSuccess: () => void;
}

const DECIMALS = 8n;
const UNIT = 10n ** DECIMALS;
const RATE_NUM = 23n;
const RATE_DEN = 10n;

function parseToken(value: string): bigint | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        const parts = trimmed.split('.');
        const intPart = parts[0] ?? '0';
        const fracStr = (parts[1] ?? '').slice(0, 8).padEnd(8, '0');
        return BigInt(intPart) * UNIT + BigInt(fracStr);
    } catch {
        return null;
    }
}

function formatToken(amount: bigint, decimals = 2): string {
    const whole = amount / UNIT;
    const frac = amount % UNIT;
    const fracStr = frac.toString().padStart(8, '0').slice(0, decimals);
    return `${whole.toString()}.${fracStr}`;
}

function calcPiggyTotal(bankAmount: bigint): bigint {
    return (bankAmount * RATE_NUM) / RATE_DEN;
}

function calcDust(piggyTotal: bigint, mode: bigint, bps: bigint): bigint {
    if (mode === 1n) {
        const remainder = piggyTotal % UNIT;
        return remainder === 0n ? 0n : UNIT - remainder;
    }
    return (piggyTotal * bps) / 10000n;
}

export function SwapTerminal({
    walletAddress,
    resolvedAddress,
    network,
    bankBalance,
    piggyBalance,
    dustConfig,
    onSuccess,
}: SwapTerminalProps) {
    const bankContract  = useBankTokenContract(network, resolvedAddress ?? undefined);
    const piggyContract = usePiggyBankContract(network, resolvedAddress ?? undefined);

    const [bankInput, setBankInput] = useState('');
    const [piggyInput, setPiggyInput] = useState('');
    const [editingBank, setEditingBank] = useState(true);
    const [step, setStep] = useState<'idle' | 'claimingBank' | 'claimingPiggy' | 'approving' | 'swapping' | 'done'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [lastTx, setLastTx] = useState<string | null>(null);

    const bankAmt = parseToken(bankInput);
    const piggyAmt = editingBank
        ? (bankAmt !== null ? calcPiggyTotal(bankAmt) : null)
        : parseToken(piggyInput);

    const effectiveBankAmt = !editingBank && piggyAmt !== null
        ? (piggyAmt * RATE_DEN) / RATE_NUM
        : bankAmt;

    const piggyTotal = effectiveBankAmt !== null ? calcPiggyTotal(effectiveBankAmt) : null;
    const dust = piggyTotal !== null && dustConfig
        ? calcDust(piggyTotal, dustConfig.mode, dustConfig.bps)
        : null;
    const piggyOut = piggyTotal !== null && dust !== null ? piggyTotal - dust : null;

    useEffect(() => {
        if (editingBank && bankAmt !== null) {
            setPiggyInput(formatToken(calcPiggyTotal(bankAmt), 4));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankInput, editingBank]);

    useEffect(() => {
        if (!editingBank && piggyAmt !== null) {
            const ba = (piggyAmt * RATE_DEN) / RATE_NUM;
            setBankInput(formatToken(ba, 4));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [piggyInput, editingBank]);

    const piggyBankAddr = network ? getContractAddress('piggyBank', network) : null;

    const txParams = {
        signer: null as null,
        mldsaSigner: null as null,
        refundTo: walletAddress ?? '',
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 10,
        network: network!,
    };

    const handleClaimBankFaucet = useCallback(async () => {
        if (!bankContract) return;
        setError(null);
        setStep('claimingBank');
        try {
            const sim = await bankContract.claimFaucet();
            if (sim.revert) { setError(`BANK Faucet: ${String(sim.revert)}`); setStep('idle'); return; }
            const tx = await sim.sendTransaction(txParams);
            setLastTx(String((tx as { txid?: string }).txid ?? ''));
            setStep('idle');
            onSuccess();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'BANK faucet failed');
            setStep('idle');
        }
    }, [bankContract, txParams, onSuccess]);

    const handleClaimPiggyFaucet = useCallback(async () => {
        if (!piggyContract) return;
        setError(null);
        setStep('claimingPiggy');
        try {
            const sim = await piggyContract.claimFaucet();
            if (sim.revert) { setError(`PIGGY Faucet: ${String(sim.revert)}`); setStep('idle'); return; }
            const tx = await sim.sendTransaction(txParams);
            setLastTx(String((tx as { txid?: string }).txid ?? ''));
            setStep('idle');
            onSuccess();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'PIGGY faucet failed');
            setStep('idle');
        }
    }, [piggyContract, txParams, onSuccess]);

    const handleApprove = useCallback(async () => {
        if (!bankContract || !effectiveBankAmt || !piggyBankAddr) return;
        setError(null);
        setStep('approving');
        try {
            const spender = Address.fromString(piggyBankAddr, piggyBankAddr);
            const sim = await bankContract.approve(spender, effectiveBankAmt);
            if (sim.revert) { setError(`Approve failed: ${String(sim.revert)}`); setStep('idle'); return; }
            await sim.sendTransaction(txParams);
            setStep('idle');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Approve failed');
            setStep('idle');
        }
    }, [bankContract, effectiveBankAmt, piggyBankAddr, txParams]);

    const handleSwap = useCallback(async () => {
        if (!piggyContract || !effectiveBankAmt || piggyTotal === null) return;
        setError(null);
        setStep('swapping');
        try {
            const minPiggyOut = (piggyTotal * 95n) / 100n;
            const sim = await piggyContract.swapForDust(effectiveBankAmt, minPiggyOut);
            if (sim.revert) { setError(`Swap failed: ${String(sim.revert)}`); setStep('idle'); return; }
            const tx = await sim.sendTransaction(txParams);
            setLastTx(String((tx as { txid?: string }).txid ?? ''));
            setStep('done');
            onSuccess();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Swap failed');
            setStep('idle');
        }
    }, [piggyContract, effectiveBankAmt, piggyTotal, txParams, onSuccess]);

    const isBusy = step !== 'idle' && step !== 'done';
    const canSwap = !!effectiveBankAmt && effectiveBankAmt > 0n && !isBusy && !!dustConfig;

    const dustModeLabel = dustConfig
        ? dustConfig.mode === 1n
            ? 'Round-Up Mode'
            : `${(Number(dustConfig.bps) / 100).toFixed(2)}% Tax Mode`
        : 'No vault';

    return (
        <div
            className="min-h-screen px-4 py-8"
            style={{ background: '#030712' }}
        >
            <div className="max-w-2xl mx-auto">

                {/* Header */}
                <div className="mb-6">
                    <h1
                        className="text-2xl font-bold tracking-widest uppercase mb-1"
                        style={{ color: '#4ade80', fontFamily: 'Courier New, monospace', textShadow: '0 0 10px rgba(74,222,128,0.4)' }}
                    >
                        Swap Terminal
                    </h1>
                    <p className="text-xs tracking-wider" style={{ color: '#4b5563' }}>
                        1 BANK = 2.3 PIGGY &nbsp;&bull;&nbsp; {dustModeLabel}
                    </p>
                </div>

                {/* Faucet buttons */}
                <div className="flex gap-3 mb-6">
                    <button
                        onClick={() => { void handleClaimBankFaucet(); }}
                        disabled={isBusy}
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                        style={{
                            border: '1px solid rgba(74,222,128,0.4)',
                            color: '#4ade80',
                            background: isBusy ? 'transparent' : 'rgba(74,222,128,0.05)',
                            opacity: isBusy ? 0.5 : 1,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            fontFamily: 'Courier New, monospace',
                        }}
                    >
                        {step === 'claimingBank' ? <><span className="spinner" />Claiming...</> : 'Inject $BANK'}
                    </button>
                    <button
                        onClick={() => { void handleClaimPiggyFaucet(); }}
                        disabled={isBusy}
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                        style={{
                            border: '1px solid rgba(74,222,128,0.4)',
                            color: '#4ade80',
                            background: isBusy ? 'transparent' : 'rgba(74,222,128,0.05)',
                            opacity: isBusy ? 0.5 : 1,
                            cursor: isBusy ? 'not-allowed' : 'pointer',
                            fontFamily: 'Courier New, monospace',
                        }}
                    >
                        {step === 'claimingPiggy' ? <><span className="spinner" />Claiming...</> : 'Inject $PIGGY'}
                    </button>
                </div>

                {/* Balances row */}
                <div className="flex gap-4 mb-4">
                    <div className="flex-1 p-3 rounded-lg text-center" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4b5563' }}>BANK Balance</p>
                        <p className="text-sm font-bold font-mono" style={{ color: '#e2e8f0' }}>{formatToken(bankBalance, 4)}</p>
                    </div>
                    <div className="flex-1 p-3 rounded-lg text-center" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4b5563' }}>PIGGY Balance</p>
                        <p className="text-sm font-bold font-mono" style={{ color: '#e2e8f0' }}>{formatToken(piggyBalance, 4)}</p>
                    </div>
                </div>

                {/* Swap card */}
                <div
                    className="rounded-xl p-6 mb-4"
                    style={{
                        background: 'rgba(15,23,42,0.8)',
                        border: '1px solid rgba(74,222,128,0.2)',
                        backdropFilter: 'blur(10px)',
                        boxShadow: '0 0 40px rgba(74,222,128,0.05)',
                    }}
                >
                    {/* Pay field */}
                    <div className="mb-4">
                        <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#4b5563' }}>Pay</label>
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#030712', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <input
                                type="number"
                                min="0"
                                step="0.00000001"
                                placeholder="0.0000"
                                value={bankInput}
                                onFocus={() => setEditingBank(true)}
                                onChange={e => { setEditingBank(true); setBankInput(e.target.value); }}
                                disabled={isBusy}
                                className="flex-1 bg-transparent outline-none text-lg font-mono"
                                style={{ color: '#e2e8f0', fontFamily: 'Courier New, monospace' }}
                            />
                            <span
                                className="px-3 py-1 rounded-lg text-xs font-bold tracking-wider"
                                style={{ background: 'rgba(247,147,26,0.15)', color: '#f7931a', border: '1px solid rgba(247,147,26,0.3)' }}
                            >
                                BANK
                            </span>
                        </div>
                    </div>

                    {/* Flip arrow */}
                    <div className="flex justify-center mb-4">
                        <div
                            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer transition-all"
                            style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
                            onClick={() => setEditingBank(!editingBank)}
                        >
                            ↕
                        </div>
                    </div>

                    {/* Receive field */}
                    <div className="mb-6">
                        <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: '#4b5563' }}>Receive</label>
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#030712', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <input
                                type="number"
                                min="0"
                                step="0.00000001"
                                placeholder="0.0000"
                                value={piggyInput}
                                onFocus={() => setEditingBank(false)}
                                onChange={e => { setEditingBank(false); setPiggyInput(e.target.value); }}
                                disabled={isBusy}
                                className="flex-1 bg-transparent outline-none text-lg font-mono"
                                style={{ color: '#e2e8f0', fontFamily: 'Courier New, monospace' }}
                            />
                            <span
                                className="px-3 py-1 rounded-lg text-xs font-bold tracking-wider"
                                style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)' }}
                            >
                                PIGGY
                            </span>
                        </div>
                    </div>

                    {/* SatStash Routing box */}
                    {dust !== null && dust > 0n && piggyOut !== null && (
                        <div
                            className="mb-6 p-4 rounded-lg"
                            style={{
                                border: '1px dashed rgba(74,222,128,0.4)',
                                background: 'rgba(74,222,128,0.03)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <span style={{ color: '#4ade80' }}>⚡</span>
                                <span
                                    className="text-xs font-bold tracking-wider uppercase"
                                    style={{ color: '#4ade80' }}
                                >
                                    Vault Routing Active
                                </span>
                            </div>
                            <div className="flex justify-between text-xs font-mono" style={{ color: '#9ca3af' }}>
                                <span>To wallet:</span>
                                <span style={{ color: '#e2e8f0' }}>{formatToken(piggyOut, 4)} PIGGY</span>
                            </div>
                            <div className="flex justify-between text-xs font-mono mt-1" style={{ color: '#9ca3af' }}>
                                <span>Stashed:</span>
                                <span style={{ color: '#4ade80' }}>+{formatToken(dust, 4)} PIGGY</span>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div
                            className="mb-4 p-3 rounded-lg text-xs font-mono"
                            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
                        >
                            {error}
                        </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={() => { void handleApprove(); }}
                            disabled={!canSwap}
                            className="flex-1 py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all"
                            style={{
                                border: '1px solid rgba(74,222,128,0.4)',
                                color: '#4ade80',
                                background: 'transparent',
                                opacity: !canSwap ? 0.4 : 1,
                                cursor: !canSwap ? 'not-allowed' : 'pointer',
                                fontFamily: 'Courier New, monospace',
                            }}
                        >
                            {step === 'approving' ? <><span className="spinner" />Approving...</> : 'Approve'}
                        </button>
                        <button
                            onClick={() => { void handleSwap(); }}
                            disabled={!canSwap}
                            className="flex-2 py-3 px-8 rounded-xl text-sm font-bold tracking-widest uppercase transition-all duration-300"
                            style={{
                                background: canSwap
                                    ? 'linear-gradient(135deg, #f7931a, #f59e0b)'
                                    : 'rgba(247,147,26,0.3)',
                                color: '#000',
                                cursor: !canSwap ? 'not-allowed' : 'pointer',
                                boxShadow: canSwap ? '0 0 20px rgba(247,147,26,0.3)' : 'none',
                                fontFamily: 'Courier New, monospace',
                                minWidth: '140px',
                            }}
                        >
                            {step === 'swapping' ? <><span className="spinner" />Swapping...</> : 'Execute Swap'}
                        </button>
                    </div>
                </div>

                {/* Success */}
                {step === 'done' && lastTx && (
                    <div
                        className="p-4 rounded-lg text-xs"
                        style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
                    >
                        <p className="font-bold mb-1">Swap complete</p>
                        <p className="font-mono break-all opacity-60">{lastTx}</p>
                    </div>
                )}

                {/* Rate footer */}
                <p className="text-center text-xs mt-6" style={{ color: '#374151', fontFamily: 'Courier New, monospace' }}>
                    1 BANK = 2.3 PIGGY &bull; OPNet Bitcoin L1
                </p>
            </div>
        </div>
    );
}
