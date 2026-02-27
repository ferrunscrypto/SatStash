import { useState, useCallback, useEffect, useRef } from 'react';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { useBankTokenContract, usePiggyBankContract, usePoolContract } from '../hooks/usePiggyBank';
import { useProvider } from '../hooks/useProvider';
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

const UNIT = 10n ** 8n;

function parseToken(value: string): bigint | null {
    // Accept both comma and dot as decimal separator
    const trimmed = value.trim().replace(',', '.');
    if (!trimmed) return null;
    try {
        const parts = trimmed.split('.');
        const intPart = parts[0] ?? '0';
        const fracStr = (parts[1] ?? '').slice(0, 8).padEnd(8, '0');
        return BigInt(intPart) * UNIT + BigInt(fracStr);
    } catch { return null; }
}

function formatToken(amount: bigint, decimals = 2): string {
    const whole = amount / UNIT;
    const frac = amount % UNIT;
    const fracStr = frac.toString().padStart(8, '0').slice(0, decimals);
    return `${whole.toLocaleString()},${fracStr}`;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button
            onClick={copy}
            title="Copy contract address"
            className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-all"
            style={{
                border: '1px solid rgba(255,255,255,0.1)',
                color: copied ? '#4ade80' : '#9ca3af',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'Courier New, monospace',
            }}
        >
            {copied ? (
                <>✓ Copied</>
            ) : (
                <>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/>
                    </svg>
                    Import
                </>
            )}
        </button>
    );
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
    const poolContract  = usePoolContract(network, resolvedAddress ?? undefined);
    const provider = useProvider(network);

    const bankAddr  = network ? getContractAddress('bankToken', network)  : null;
    const piggyAddr = network ? getContractAddress('piggyBank', network)  : null;
    const poolAddr  = network ? getContractAddress('pool', network)       : null;

    // ── Swap direction ──────────────────────────────────────────
    const [bankToPiggy, setBankToPiggy] = useState(true);
    const [inputStr, setInputStr]   = useState('');
    const [outputAmt, setOutputAmt] = useState<bigint | null>(null);
    const [reserves, setReserves]   = useState<{ bank: bigint; piggy: bigint } | null>(null);
    const [quoting, setQuoting]     = useState(false);

    // ── Tx state ────────────────────────────────────────────────
    const [step, setStep] = useState<'idle' | 'claimingBank' | 'claimingPiggy' | 'approving' | 'swapping' | 'done'>('idle');
    const [pendingTxId, setPendingTxId]     = useState<string | null>(null);
    const [pendingAction, setPendingAction] = useState<'faucet-bank' | 'faucet-piggy' | 'approve' | 'swap' | null>(null);
    const [error, setError]   = useState<string | null>(null);
    const [lastTx, setLastTx] = useState<string | null>(null);

    // Faucets have independent busy states so both can be claimed back-to-back
    const bankFaucetBusy  = step === 'claimingBank'  || (!!pendingTxId && pendingAction === 'faucet-bank');
    const piggyFaucetBusy = step === 'claimingPiggy' || (!!pendingTxId && pendingAction === 'faucet-piggy');
    const swapBusy = (step === 'approving' || step === 'swapping') || (!!pendingTxId && (pendingAction === 'approve' || pendingAction === 'swap'));
    const isBusy = swapBusy;

    const inputAmt = parseToken(inputStr);

    // ── Fetch reserves ──────────────────────────────────────────
    const fetchReserves = useCallback(async () => {
        if (!poolContract) return;
        try {
            const res = await poolContract.getReserves() as { properties?: { bankReserve?: bigint; piggyReserve?: bigint } } | null;
            const p = res?.properties;
            if (p?.bankReserve != null && p?.piggyReserve != null) {
                setReserves({ bank: p.bankReserve, piggy: p.piggyReserve });
            }
        } catch { /* ignore */ }
    }, [poolContract]);

    useEffect(() => { void fetchReserves(); }, [fetchReserves]);

    // Whether to use PiggyBank's atomic swap (vault active in either direction)
    const useAtomicSwap = !!dustConfig && dustConfig.mode > 0n;

    // ── Quote output ─────────────────────────────────────────────
    const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (quoteTimer.current) clearTimeout(quoteTimer.current);
        if (!inputAmt || inputAmt === 0n) { setOutputAmt(null); return; }

        if (useAtomicSwap) {
            if (bankToPiggy) {
                // swapForDust: 1 BANK = 2.3 PIGGY (fixed rate, dust taken from output)
                const piggyTotal = (inputAmt * 23n) / 10n;
                setOutputAmt(piggyTotal);
            } else {
                // swapPiggyForBank: dust taken from PIGGY input, then reverse rate
                let dust = 0n;
                if (dustConfig!.mode === 1n) {
                    const frac = inputAmt % UNIT;
                    dust = frac > 0n ? UNIT - frac : 0n;
                } else if (dustConfig!.mode === 2n && dustConfig!.bps > 0n) {
                    dust = (inputAmt * dustConfig!.bps) / 10000n;
                }
                if (dust >= inputAmt) dust = inputAmt;
                const piggyToSwap = inputAmt - dust;
                const bankOut = (piggyToSwap * 10n) / 23n;
                setOutputAmt(bankOut);
            }
            return;
        }

        if (!poolContract) { setOutputAmt(null); return; }
        setQuoting(true);
        quoteTimer.current = setTimeout(async () => {
            try {
                const res = await poolContract.getAmountOut(inputAmt, bankToPiggy) as { properties?: { amountOut?: bigint } } | null;
                setOutputAmt(res?.properties?.amountOut ?? null);
            } catch { setOutputAmt(null); }
            finally { setQuoting(false); }
        }, 400);
        return () => { if (quoteTimer.current) clearTimeout(quoteTimer.current); };
    }, [inputAmt, bankToPiggy, poolContract, useAtomicSwap]);

    // ── Flip direction ──────────────────────────────────────────
    const handleFlip = () => {
        setBankToPiggy(d => !d);
        setInputStr(outputAmt !== null ? formatToken(outputAmt) : '');
        setOutputAmt(null);
    };

    const txParams = {
        signer: null as null,
        mldsaSigner: null as null,
        refundTo: walletAddress ?? '',
        maximumAllowedSatToSpend: 100_000n,
        feeRate: 10,
        network: network!,
    };

    // ── Helpers ─────────────────────────────────────────────────
    const submitTx = async (sim: { revert?: unknown; sendTransaction: (p: unknown) => Promise<unknown> }, action: 'faucet-bank' | 'faucet-piggy' | 'approve' | 'swap', onNoTxId?: () => void) => {
        if (sim.revert) throw new Error(String(sim.revert));
        const result = await sim.sendTransaction(txParams) as { transactionId?: string; txid?: string } | null;
        const txId = result?.transactionId ?? result?.txid ?? null;
        if (txId) {
            setPendingTxId(txId);
            setPendingAction(action);
            if (action === 'swap') setLastTx(txId);
        } else {
            onNoTxId?.();
        }
    };

    // ── Faucets ──────────────────────────────────────────────────
    const handleClaimBankFaucet = useCallback(async () => {
        if (!bankContract) return;
        setError(null); setStep('claimingBank');
        try {
            const sim = await bankContract.claimFaucet();
            await submitTx(sim, 'faucet-bank', () => { setStep('idle'); onSuccess(); });
        } catch (e) { setError(e instanceof Error ? e.message : 'BANK faucet failed'); setStep('idle'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankContract]);

    const handleClaimPiggyFaucet = useCallback(async () => {
        if (!piggyContract) return;
        setError(null); setStep('claimingPiggy');
        try {
            const sim = await piggyContract.claimFaucet();
            await submitTx(sim, 'faucet-piggy', () => { setStep('idle'); onSuccess(); });
        } catch (e) { setError(e instanceof Error ? e.message : 'PIGGY faucet failed'); setStep('idle'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [piggyContract]);

    // ── Approve ──────────────────────────────────────────────────
    const handleApprove = useCallback(async () => {
        if (!inputAmt || !provider) return;
        setError(null); setStep('approving');
        try {
            const MAX_U256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
            let sim;

            if (useAtomicSwap && bankToPiggy) {
                // BANK→PIGGY atomic: approve PiggyBank to spend BANK
                if (!bankContract || !piggyAddr) return;
                const piggyAddrObj = await provider.getPublicKeyInfo(piggyAddr, true);
                sim = await bankContract.increaseAllowance(piggyAddrObj, MAX_U256);
            } else if (useAtomicSwap && !bankToPiggy) {
                // PIGGY→BANK atomic: PiggyBank IS the PIGGY token, uses _transfer internally
                // No approval needed — skip directly to swap
                setStep('idle');
                return;
            } else if (bankToPiggy) {
                // Pool swap: approve pool to spend BANK
                if (!bankContract || !poolAddr) return;
                const poolAddrObj = await provider.getPublicKeyInfo(poolAddr, true);
                sim = await bankContract.increaseAllowance(poolAddrObj, MAX_U256);
            } else {
                // Pool swap: approve pool to spend PIGGY
                if (!piggyContract || !poolAddr) return;
                const poolAddrObj = await provider.getPublicKeyInfo(poolAddr, true);
                sim = await piggyContract.increaseAllowance(poolAddrObj, MAX_U256);
            }

            await submitTx(sim, 'approve', () => setStep('idle'));
        } catch (e) { setError(e instanceof Error ? e.message : 'Approve failed'); setStep('idle'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankContract, piggyContract, bankToPiggy, inputAmt, poolAddr, piggyAddr, provider, useAtomicSwap]);

    // ── Swap ─────────────────────────────────────────────────────
    const handleSwap = useCallback(async () => {
        if (!inputAmt || outputAmt === null) return;
        setError(null); setStep('swapping');
        try {
            if (useAtomicSwap && bankToPiggy) {
                // BANK→PIGGY atomic: PiggyBank.swapForDust — single TX!
                if (!piggyContract) return;
                const piggyTotal = (inputAmt * 23n) / 10n;
                const minOut = (piggyTotal * 90n) / 100n;
                const sim = await piggyContract.swapForDust(inputAmt, minOut);
                await submitTx(sim, 'swap', () => { setStep('done'); onSuccess(); });
            } else if (useAtomicSwap && !bankToPiggy) {
                // PIGGY→BANK atomic: PiggyBank.swapPiggyForBank — single TX!
                if (!piggyContract) return;
                const minOut = (outputAmt * 90n) / 100n;
                const sim = await piggyContract.swapPiggyForBank(inputAmt, minOut);
                await submitTx(sim, 'swap', () => { setStep('done'); onSuccess(); });
            } else {
                // Pool swap (PIGGY→BANK or BANK→PIGGY without vault)
                if (!poolContract) return;
                let freshOut = outputAmt;
                try {
                    const res = await poolContract.getAmountOut(inputAmt, bankToPiggy) as { properties?: { amountOut?: bigint } } | null;
                    if (res?.properties?.amountOut) freshOut = res.properties.amountOut;
                } catch { /* use cached quote */ }
                const minOut = (freshOut * 90n) / 100n;
                const sim = await poolContract.swap(inputAmt, bankToPiggy, minOut);
                await submitTx(sim, 'swap', () => { setStep('done'); onSuccess(); });
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Swap failed';
            if (msg.includes('Insufficient balance') && useAtomicSwap && !bankToPiggy) {
                setError('Not enough BANK reserves in vault contract. Do a BANK→PIGGY swap first to build reserves.');
            } else {
                setError(msg);
            }
            setStep('idle');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [poolContract, piggyContract, inputAmt, outputAmt, bankToPiggy, useAtomicSwap]);

    // ── Confirmation polling ─────────────────────────────────────
    useEffect(() => {
        if (!pendingTxId || !provider) return;
        let cancelled = false;
        const confirm = () => {
            setPendingTxId(null);
            if (pendingAction === 'swap') {
                void fetchReserves();
                setStep('done');
                onSuccess();
            } else {
                setStep('idle');
                if (pendingAction === 'faucet-bank' || pendingAction === 'faucet-piggy') onSuccess();
            }
            setPendingAction(null);
        };
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
    }, [pendingTxId, provider, pendingAction, onSuccess, fetchReserves]);

    // ── Derived display values ───────────────────────────────────
    const inToken  = bankToPiggy ? '$BANK'  : '$PIGGY';
    const outToken = bankToPiggy ? '$PIGGY' : '$BANK';
    const inBalance  = bankToPiggy ? bankBalance  : piggyBalance;
    const outBalance = bankToPiggy ? piggyBalance : bankBalance;

    const rate = reserves && reserves.bank > 0n && reserves.piggy > 0n
        ? bankToPiggy
            ? (Number(reserves.piggy) / Number(reserves.bank)).toFixed(2)
            : (Number(reserves.bank)  / Number(reserves.piggy)).toFixed(2)
        : null;

    const canSwap = !!inputAmt && inputAmt > 0n && outputAmt !== null && outputAmt > 0n && !isBusy;

    const inColor  = bankToPiggy ? '#f7931a' : '#4ade80';
    const outColor = bankToPiggy ? '#4ade80' : '#f7931a';

    return (
        <div className="min-h-screen px-4 py-8" style={{ background: '#030712' }}>
            <div className="max-w-2xl mx-auto">

                {/* Header */}
                <div className="mb-6">
                    <h1
                        className="text-2xl font-bold tracking-widest uppercase mb-1"
                        style={{ color: '#4ade80', fontFamily: 'Courier New, monospace', textShadow: '0 0 10px rgba(74,222,128,0.4)' }}
                    >
                        Swap Terminal
                    </h1>
                    <div className="flex items-center gap-3">
                        <p className="text-xs tracking-wider" style={{ color: '#9ca3af' }}>
                            {rate
                                ? `1 ${inToken} ≈ ${rate} ${outToken} · live LP rate`
                                : 'Fetching rate...'}
                        </p>
                        {reserves && (
                            <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                                Reserves: {formatToken(reserves.bank, 2)} BANK / {formatToken(reserves.piggy, 2)} PIGGY
                            </span>
                        )}
                    </div>
                </div>

                {/* Faucet buttons */}
                <div className="flex gap-3 mb-4">
                    <button
                        onClick={() => { void handleClaimBankFaucet(); }}
                        disabled={bankFaucetBusy}
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                        style={{
                            border: '1px solid rgba(247,147,26,0.4)',
                            color: '#f7931a',
                            background: bankFaucetBusy ? 'transparent' : 'rgba(247,147,26,0.05)',
                            opacity: bankFaucetBusy ? 0.5 : 1,
                            cursor: bankFaucetBusy ? 'not-allowed' : 'pointer',
                            fontFamily: 'Courier New, monospace',
                        }}
                    >
                        {step === 'claimingBank' ? <><span className="spinner" />Claiming...</>
                            : pendingTxId && pendingAction === 'faucet-bank' ? <><span className="spinner" />Confirming...</>
                            : 'Faucet $BANK'}
                    </button>
                    <button
                        onClick={() => { void handleClaimPiggyFaucet(); }}
                        disabled={piggyFaucetBusy}
                        className="flex-1 py-2 px-4 rounded-lg text-xs font-bold tracking-wider uppercase transition-all"
                        style={{
                            border: '1px solid rgba(74,222,128,0.4)',
                            color: '#4ade80',
                            background: piggyFaucetBusy ? 'transparent' : 'rgba(74,222,128,0.05)',
                            opacity: piggyFaucetBusy ? 0.5 : 1,
                            cursor: piggyFaucetBusy ? 'not-allowed' : 'pointer',
                            fontFamily: 'Courier New, monospace',
                        }}
                    >
                        {step === 'claimingPiggy' ? <><span className="spinner" />Claiming...</>
                            : pendingTxId && pendingAction === 'faucet-piggy' ? <><span className="spinner" />Confirming...</>
                            : 'Faucet $PIGGY'}
                    </button>
                </div>

                {/* Step guide */}
                <div className="mb-6 p-4 rounded-xl" style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#9ca3af' }}>How to swap</p>
                    <div className="flex items-start gap-3">
                        {[
                            { n: '1', label: 'Get tokens', desc: 'Claim free $BANK and $PIGGY from faucet above' },
                            { n: '2', label: 'Set amount', desc: 'Enter how much you want to swap' },
                            { n: '3', label: 'Approve', desc: 'Allow the pool to spend your tokens' },
                            { n: '4', label: 'Swap', desc: 'Execute and receive tokens to your wallet' },
                        ].map((s) => (
                            <div key={s.n} className="flex-1 flex flex-col items-center text-center gap-1">
                                <div
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                                    style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
                                >
                                    {s.n}
                                </div>
                                <p className="text-xs font-bold" style={{ color: '#e2e8f0' }}>{s.label}</p>
                                <p className="text-xs leading-tight" style={{ color: '#9ca3af' }}>{s.desc}</p>
                            </div>
                        ))}
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
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs uppercase tracking-widest" style={{ color: '#9ca3af' }}>Pay</label>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                                    Balance: <span style={{ color: '#9ca3af' }}>{formatToken(inBalance, 2)}</span>
                                </span>
                                <button
                                    onClick={() => setInputStr(formatToken(inBalance))}
                                    className="text-xs px-2 py-0.5 rounded"
                                    style={{ border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', background: 'transparent', cursor: 'pointer' }}
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#030712', border: `1px solid ${inColor}33` }}>
                            <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                value={inputStr}
                                onChange={e => setInputStr(e.target.value)}
                                disabled={isBusy}
                                className="flex-1 bg-transparent outline-none text-lg font-mono"
                                style={{ color: '#e2e8f0', fontFamily: 'Courier New, monospace' }}
                            />
                            <div className="flex flex-col items-end gap-1">
                                <span
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold tracking-wider"
                                    style={{ background: `${inColor}22`, color: inColor, border: `1px solid ${inColor}44` }}
                                >
                                    {inToken}
                                </span>
                                {(bankToPiggy ? bankAddr : piggyAddr) && (
                                    <CopyButton text={(bankToPiggy ? bankAddr : piggyAddr)!} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Flip button */}
                    <div className="flex justify-center mb-4">
                        <button
                            onClick={handleFlip}
                            disabled={isBusy}
                            className="w-9 h-9 flex items-center justify-center rounded-full transition-all"
                            style={{
                                background: 'rgba(74,222,128,0.1)',
                                border: '1px solid rgba(74,222,128,0.3)',
                                color: '#4ade80',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                                fontSize: '18px',
                            }}
                        >
                            ↕
                        </button>
                    </div>

                    {/* Receive field */}
                    <div className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs uppercase tracking-widest" style={{ color: '#9ca3af' }}>Receive</label>
                            <span className="text-xs font-mono" style={{ color: '#9ca3af' }}>
                                Balance: <span style={{ color: '#9ca3af' }}>{formatToken(outBalance, 2)}</span>
                            </span>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: '#030712', border: `1px solid ${outColor}22` }}>
                            <div className="flex-1 text-lg font-mono" style={{ color: quoting ? '#9ca3af' : '#e2e8f0', fontFamily: 'Courier New, monospace' }}>
                                {quoting ? 'Quoting...' : outputAmt !== null ? formatToken(outputAmt) : '0.0000'}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <span
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold tracking-wider"
                                    style={{ background: `${outColor}22`, color: outColor, border: `1px solid ${outColor}44` }}
                                >
                                    {outToken}
                                </span>
                                {(bankToPiggy ? piggyAddr : bankAddr) && (
                                    <CopyButton text={(bankToPiggy ? piggyAddr : bankAddr)!} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Slippage note */}
                    {outputAmt !== null && outputAmt > 0n && (
                        <p className="text-xs mb-4 text-center" style={{ color: '#9ca3af' }}>
                            Min received: {formatToken((outputAmt * 95n) / 100n)} {outToken} (5% slippage)
                        </p>
                    )}

                    {/* Vault routing info — both directions when vault active */}
                    {useAtomicSwap && inputAmt && inputAmt > 0n && outputAmt !== null && outputAmt > 0n && (() => {
                        // Calculate stash amount based on dust mode
                        let stashAmt = 0n;
                        if (bankToPiggy) {
                            // BANK→PIGGY: dust calculated from PIGGY output
                            if (dustConfig!.mode === 1n) {
                                const frac = outputAmt % UNIT;
                                stashAmt = frac > 0n ? UNIT - frac : 0n;
                            } else if (dustConfig!.mode === 2n && dustConfig!.bps > 0n) {
                                stashAmt = (outputAmt * dustConfig!.bps) / 10000n;
                            }
                        } else {
                            // PIGGY→BANK: dust calculated from PIGGY input
                            if (dustConfig!.mode === 1n) {
                                const frac = inputAmt % UNIT;
                                stashAmt = frac > 0n ? UNIT - frac : 0n;
                            } else if (dustConfig!.mode === 2n && dustConfig!.bps > 0n) {
                                stashAmt = (inputAmt * dustConfig!.bps) / 10000n;
                            }
                        }
                        return (
                            <div
                                className="mb-4 p-3 rounded-lg"
                                style={{ border: '1px dashed rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.03)' }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <span style={{ color: '#4ade80' }}>⚡</span>
                                        <span className="text-xs font-bold tracking-wider uppercase" style={{ color: '#4ade80' }}>
                                            Vault Routing Active
                                        </span>
                                    </div>
                                    {stashAmt > 0n && (
                                        <span className="text-xs font-mono font-bold" style={{ color: '#4ade80' }}>
                                            +{formatToken(stashAmt)} $PIGGY
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs" style={{ color: '#9ca3af' }}>
                                    {dustConfig!.mode === 1n
                                        ? 'Round-up dust auto-routes to your stash'
                                        : `${(Number(dustConfig!.bps) / 100).toFixed(2)}% tax auto-routes to your stash`}
                                    {!bankToPiggy && ' (from input $PIGGY)'}
                                </p>
                            </div>
                        );
                    })()}

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
                        {/* Hide approve button for PIGGY→BANK atomic (no approval needed) */}
                        {!(useAtomicSwap && !bankToPiggy) && (
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
                                {step === 'approving' ? <><span className="spinner" />Approving...</>
                                    : pendingTxId && pendingAction === 'approve' ? <><span className="spinner" />Confirming...</>
                                    : `Approve ${inToken}`}
                            </button>
                        )}
                        <button
                            onClick={() => { void handleSwap(); }}
                            disabled={!canSwap}
                            className="flex-2 py-3 px-8 rounded-xl text-sm font-bold tracking-widest uppercase transition-all duration-300"
                            style={{
                                background: canSwap ? 'linear-gradient(135deg, #f7931a, #f59e0b)' : 'rgba(247,147,26,0.3)',
                                color: '#000',
                                cursor: !canSwap ? 'not-allowed' : 'pointer',
                                boxShadow: canSwap ? '0 0 20px rgba(247,147,26,0.3)' : 'none',
                                fontFamily: 'Courier New, monospace',
                                minWidth: '140px',
                            }}
                        >
                            {step === 'swapping' ? <><span className="spinner" />{useAtomicSwap ? 'Swapping + Stashing...' : 'Swapping...'}</>
                                : pendingTxId && pendingAction === 'swap' ? <><span className="spinner" />Confirming...</>
                                : useAtomicSwap ? 'Swap + Stash' : 'Execute Swap'}
                        </button>
                    </div>
                </div>

                {/* Success */}
                {step === 'done' && lastTx && (
                    <div
                        className="p-4 rounded-lg text-xs"
                        style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80' }}
                    >
                        <p className="font-bold mb-1">✓ Swap complete</p>
                        <p className="font-mono break-all opacity-60">{lastTx}</p>
                        <button
                            onClick={() => { setStep('idle'); setInputStr(''); setOutputAmt(null); setLastTx(null); void fetchReserves(); }}
                            className="mt-2 text-xs underline opacity-60 hover:opacity-100"
                            style={{ color: '#4ade80', background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            Swap again
                        </button>
                    </div>
                )}

                <p className="text-center text-xs mt-6" style={{ color: '#9ca3af', fontFamily: 'Courier New, monospace' }}>
                    Constant-product AMM &bull; OPNet Bitcoin L1
                </p>
            </div>
        </div>
    );
}
