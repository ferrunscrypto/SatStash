/**
 * SatStashPool Business Logic Tests
 *
 * Pure TypeScript mirrors of the constant-product AMM logic.
 */
import { describe, it, expect } from 'vitest';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PoolState {
    bankReserve: bigint;
    piggyReserve: bigint;
    initialized: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FEE_NUMERATOR   = 997n;
const FEE_DENOMINATOR = 1000n;

// ── Pure logic helpers ────────────────────────────────────────────────────────

function initializeLiquidity(
    pool: PoolState,
    owner: string,
    caller: string,
    bankAmount: bigint,
    piggyAmount: bigint,
): PoolState {
    if (caller !== owner) throw new Error('Only owner can initialize liquidity');
    if (pool.initialized) throw new Error('Already initialized');
    if (bankAmount === 0n || piggyAmount === 0n) throw new Error('Amounts must be > 0');
    return { bankReserve: bankAmount, piggyReserve: piggyAmount, initialized: true };
}

function getAmountOut(
    pool: PoolState,
    amountIn: bigint,
    swapBankToPiggy: boolean,
): bigint {
    if (amountIn === 0n) return 0n;
    const reserveIn  = swapBankToPiggy ? pool.bankReserve  : pool.piggyReserve;
    const reserveOut = swapBankToPiggy ? pool.piggyReserve : pool.bankReserve;
    const effectiveIn = (amountIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
    return (reserveOut * effectiveIn) / (reserveIn + effectiveIn);
}

function swap(
    pool: PoolState,
    amountIn: bigint,
    swapBankToPiggy: boolean,
    minAmountOut: bigint,
): { pool: PoolState; amountOut: bigint } {
    if (!pool.initialized) throw new Error('Pool not initialized');
    if (amountIn === 0n) throw new Error('Amount must be > 0');

    const amountOut = getAmountOut(pool, amountIn, swapBankToPiggy);

    if (amountOut < minAmountOut) throw new Error('Slippage exceeded');

    const reserveOut = swapBankToPiggy ? pool.piggyReserve : pool.bankReserve;
    if (amountOut >= reserveOut) throw new Error('Insufficient liquidity');

    let newPool: PoolState;
    if (swapBankToPiggy) {
        newPool = {
            bankReserve:  pool.bankReserve  + amountIn,
            piggyReserve: pool.piggyReserve - amountOut,
            initialized: true,
        };
    } else {
        newPool = {
            piggyReserve: pool.piggyReserve + amountIn,
            bankReserve:  pool.bankReserve  - amountOut,
            initialized: true,
        };
    }

    return { pool: newPool, amountOut };
}

// ── Tests: initializeLiquidity ────────────────────────────────────────────────

describe('initializeLiquidity', () => {
    const emptyPool: PoolState = { bankReserve: 0n, piggyReserve: 0n, initialized: false };

    it('sets reserves correctly', () => {
        const pool = initializeLiquidity(emptyPool, 'owner', 'owner', 1000n * 10n**8n, 2300n * 10n**8n);
        expect(pool.bankReserve).toBe(100_000_000_000n);
        expect(pool.piggyReserve).toBe(230_000_000_000n);
        expect(pool.initialized).toBe(true);
    });

    it('rejects non-owner', () => {
        expect(() => initializeLiquidity(emptyPool, 'owner', 'attacker', 1000n, 2300n))
            .toThrow('Only owner can initialize liquidity');
    });

    it('rejects if already initialized', () => {
        const pool = initializeLiquidity(emptyPool, 'owner', 'owner', 1000n, 2300n);
        expect(() => initializeLiquidity(pool, 'owner', 'owner', 1000n, 2300n))
            .toThrow('Already initialized');
    });

    it('rejects zero bankAmount', () => {
        expect(() => initializeLiquidity(emptyPool, 'owner', 'owner', 0n, 2300n))
            .toThrow('Amounts must be > 0');
    });

    it('rejects zero piggyAmount', () => {
        expect(() => initializeLiquidity(emptyPool, 'owner', 'owner', 1000n, 0n))
            .toThrow('Amounts must be > 0');
    });
});

// ── Tests: getAmountOut ───────────────────────────────────────────────────────

describe('getAmountOut', () => {
    // Pool: 1000 BANK (reserve), 2300 PIGGY (reserve) — ratio 1:2.3
    const pool: PoolState = {
        bankReserve: 1000n * 10n**8n,
        piggyReserve: 2300n * 10n**8n,
        initialized: true,
    };

    it('returns 0 for amountIn=0', () => {
        expect(getAmountOut(pool, 0n, true)).toBe(0n);
    });

    it('BANK→PIGGY: applies 0.3% fee via constant-product formula', () => {
        // amountIn = 1 BANK = 10^8
        const amountIn = 100_000_000n;
        const out = getAmountOut(pool, amountIn, true);

        // effectiveIn = 100_000_000 * 997 / 1000 = 99_700_000
        // amountOut = (2300e8 * 99700000) / (1000e8 + 99700000)
        const effectiveIn = (amountIn * 997n) / 1000n;
        const expected = (230_000_000_000n * effectiveIn) / (100_000_000_000n + effectiveIn);
        expect(out).toBe(expected);

        // Should be slightly less than 2.3 PIGGY due to pool impact + fee
        expect(out).toBeLessThan(230_000_000n); // < 2.3 PIGGY (exact 2.3 ignores price impact)
        expect(out).toBeGreaterThan(220_000_000n); // > 2.2 PIGGY
    });

    it('PIGGY→BANK: applies fee correctly', () => {
        const amountIn = 230_000_000n; // 2.3 PIGGY
        const out = getAmountOut(pool, amountIn, false);
        // Should get slightly less than 1 BANK
        expect(out).toBeLessThan(100_000_000n);
        expect(out).toBeGreaterThan(90_000_000n);
    });

    it('larger swap has more price impact', () => {
        const small = getAmountOut(pool, 100_000_000n, true);   // 1 BANK
        const large = getAmountOut(pool, 10_000_000_000n, true); // 100 BANK
        // Large swap: amountOut / amountIn should be less (worse rate)
        const smallRate = (small * 100n) / 100_000_000n;
        const largeRate = (large * 100n) / 10_000_000_000n;
        expect(largeRate).toBeLessThan(smallRate);
    });
});

// ── Tests: swap BANK→PIGGY ────────────────────────────────────────────────────

describe('swap BANK→PIGGY', () => {
    const initialPool: PoolState = {
        bankReserve: 1000n * 10n**8n,
        piggyReserve: 2300n * 10n**8n,
        initialized: true,
    };

    it('updates reserves correctly after swap', () => {
        const amountIn = 100_000_000n; // 1 BANK
        const { pool: newPool, amountOut } = swap(initialPool, amountIn, true, 0n);

        expect(newPool.bankReserve).toBe(initialPool.bankReserve + amountIn);
        expect(newPool.piggyReserve).toBe(initialPool.piggyReserve - amountOut);
        expect(amountOut).toBeGreaterThan(0n);
    });

    it('k is non-decreasing (constant-product invariant)', () => {
        const amountIn = 100_000_000n;
        const { pool: newPool } = swap(initialPool, amountIn, true, 0n);

        const kBefore = initialPool.bankReserve * initialPool.piggyReserve;
        const kAfter  = newPool.bankReserve * newPool.piggyReserve;
        // k should increase due to fee (997/1000 of input is used for pricing)
        expect(kAfter).toBeGreaterThanOrEqual(kBefore);
    });

    it('reverts when slippage exceeded', () => {
        const amountIn = 100_000_000n;
        const expectedOut = getAmountOut(initialPool, amountIn, true);
        expect(() => swap(initialPool, amountIn, true, expectedOut + 1n))
            .toThrow('Slippage exceeded');
    });

    it('exact minAmountOut = expectedOut succeeds', () => {
        const amountIn = 100_000_000n;
        const expectedOut = getAmountOut(initialPool, amountIn, true);
        const { amountOut } = swap(initialPool, amountIn, true, expectedOut);
        expect(amountOut).toBe(expectedOut);
    });
});

// ── Tests: swap PIGGY→BANK ────────────────────────────────────────────────────

describe('swap PIGGY→BANK', () => {
    const initialPool: PoolState = {
        bankReserve: 1000n * 10n**8n,
        piggyReserve: 2300n * 10n**8n,
        initialized: true,
    };

    it('updates reserves correctly', () => {
        const amountIn = 230_000_000n; // 2.3 PIGGY
        const { pool: newPool, amountOut } = swap(initialPool, amountIn, false, 0n);

        expect(newPool.piggyReserve).toBe(initialPool.piggyReserve + amountIn);
        expect(newPool.bankReserve).toBe(initialPool.bankReserve - amountOut);
        expect(amountOut).toBeGreaterThan(0n);
        expect(amountOut).toBeLessThan(100_000_000n); // less than 1 BANK
    });

    it('reverts when slippage exceeded', () => {
        const amountIn = 230_000_000n;
        const expectedOut = getAmountOut(initialPool, amountIn, false);
        expect(() => swap(initialPool, amountIn, false, expectedOut + 1n))
            .toThrow('Slippage exceeded');
    });
});

// ── Tests: edge cases ─────────────────────────────────────────────────────────

describe('edge cases', () => {
    it('swap reverts when pool not initialized', () => {
        const uninit: PoolState = { bankReserve: 0n, piggyReserve: 0n, initialized: false };
        expect(() => swap(uninit, 100_000_000n, true, 0n)).toThrow('Pool not initialized');
    });

    it('swap reverts with zero amountIn', () => {
        const pool: PoolState = {
            bankReserve: 1000n * 10n**8n,
            piggyReserve: 2300n * 10n**8n,
            initialized: true,
        };
        expect(() => swap(pool, 0n, true, 0n)).toThrow('Amount must be > 0');
    });

    it('consecutive swaps maintain reserve integrity', () => {
        let pool: PoolState = {
            bankReserve: 1000n * 10n**8n,
            piggyReserve: 2300n * 10n**8n,
            initialized: true,
        };

        for (let i = 0; i < 5; i++) {
            const { pool: next } = swap(pool, 10_000_000n, true, 0n);
            pool = next;
        }

        // Reserves should still be valid (both > 0)
        expect(pool.bankReserve).toBeGreaterThan(0n);
        expect(pool.piggyReserve).toBeGreaterThan(0n);
    });
});
