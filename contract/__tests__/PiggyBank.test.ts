/**
 * PiggyBank Business Logic Tests
 *
 * Pure TypeScript mirrors of the AssemblyScript contract logic.
 * Tests both vault mechanics, dust/swap logic, faucet, and unlocked vaults.
 */
import { describe, it, expect } from 'vitest';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Position {
    balance: bigint;
    unlockBlock: bigint;
    depositCount: bigint;
}

interface VaultConfig {
    mode: number;       // 1 = round-up, 2 = fixed%
    bps: number;        // basis points (only for mode=2)
    lockBlocks: bigint; // 0 = unlocked mode
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PIGGY_UNIT    = 100_000_000n;    // 10^8
const RATE_NUM      = 23n;              // 2.3 = 23/10
const RATE_DEN      = 10n;
const FAUCET_AMOUNT = 10_000_000_000_000n; // 100K PIGGY × 10^8

// ── Pure logic helpers ────────────────────────────────────────────────────────

function createVault(config: VaultConfig): VaultConfig {
    if (config.mode !== 1 && config.mode !== 2) throw new Error('Mode must be 1 or 2');
    if (config.mode === 2 && (config.bps < 1 || config.bps > 1000)) throw new Error('BPS must be 1-1000');
    // lockBlocks=0 is allowed (unlocked mode); only check max when > 0
    if (config.lockBlocks > 0n && config.lockBlocks > 52_560n) {
        throw new Error('Lock period exceeds maximum (52560 blocks)');
    }
    return config;
}

function calcPiggyTotal(bankAmount: bigint): bigint {
    return (bankAmount * RATE_NUM) / RATE_DEN;
}

function calcDust(piggyTotal: bigint, mode: number, bps: number): bigint {
    if (mode === 1) {
        const remainder = piggyTotal % PIGGY_UNIT;
        return remainder === 0n ? 0n : PIGGY_UNIT - remainder;
    } else {
        return (piggyTotal * BigInt(bps)) / 10000n;
    }
}

function swapForDust(
    position: Position,
    config: VaultConfig,
    bankAmount: bigint,
    minPiggyOut: bigint,
    currentBlock: bigint,
): { position: Position; piggyToWallet: bigint; dust: bigint } {
    if (bankAmount === 0n) throw new Error('Amount must be > 0');
    // Vault check: mode=0 means no vault (mode is always 1 or 2 once configured)
    if (config.mode === 0) throw new Error('Create vault first');

    const piggyTotal = calcPiggyTotal(bankAmount);
    const dust = calcDust(piggyTotal, config.mode, config.bps);
    const piggyToWallet = piggyTotal - dust;

    if (piggyToWallet < minPiggyOut) throw new Error('Slippage exceeded');

    let newPos: Position;
    if (position.balance === 0n) {
        newPos = {
            balance: dust,
            unlockBlock: currentBlock + config.lockBlocks,
            depositCount: 1n,
        };
    } else {
        newPos = {
            balance: position.balance + dust,
            unlockBlock: position.unlockBlock,    // lock unchanged
            depositCount: position.depositCount + 1n,
        };
    }

    return { position: newPos, piggyToWallet, dust };
}

function withdraw(position: Position, currentBlock: bigint): { amount: bigint; position: Position } {
    if (position.balance === 0n) throw new Error('No position to withdraw');
    if (currentBlock < position.unlockBlock) throw new Error('Still locked');
    const amount = position.balance;
    return { amount, position: { balance: 0n, unlockBlock: 0n, depositCount: 0n } };
}

function canWithdraw(position: Position, currentBlock: bigint): boolean {
    return position.balance > 0n && currentBlock >= position.unlockBlock;
}

// Simulate faucet (per-address claimed map)
function claimFaucet(claimedMap: Map<string, boolean>, user: string): bigint {
    if (claimedMap.get(user)) throw new Error('Faucet already claimed');
    claimedMap.set(user, true);
    return FAUCET_AMOUNT;
}

// ── Tests: createVault ────────────────────────────────────────────────────────

describe('createVault', () => {
    it('accepts mode=1 (round-up) with any lockBlocks', () => {
        const cfg = createVault({ mode: 1, bps: 0, lockBlocks: 1000n });
        expect(cfg.mode).toBe(1);
        expect(cfg.lockBlocks).toBe(1000n);
    });

    it('accepts mode=2 (fixed%) with valid bps', () => {
        const cfg = createVault({ mode: 2, bps: 100, lockBlocks: 5000n });
        expect(cfg.bps).toBe(100);
    });

    it('accepts lockBlocks=0 (unlocked mode)', () => {
        const cfg = createVault({ mode: 1, bps: 0, lockBlocks: 0n });
        expect(cfg.lockBlocks).toBe(0n);
    });

    it('accepts lockBlocks=0 with mode=2', () => {
        const cfg = createVault({ mode: 2, bps: 500, lockBlocks: 0n });
        expect(cfg.lockBlocks).toBe(0n);
        expect(cfg.bps).toBe(500);
    });

    it('rejects mode=0', () => {
        expect(() => createVault({ mode: 0, bps: 0, lockBlocks: 1000n })).toThrow('Mode must be 1 or 2');
    });

    it('rejects mode=3', () => {
        expect(() => createVault({ mode: 3, bps: 0, lockBlocks: 1000n })).toThrow('Mode must be 1 or 2');
    });

    it('rejects mode=2 with bps=0', () => {
        expect(() => createVault({ mode: 2, bps: 0, lockBlocks: 1000n })).toThrow('BPS must be 1-1000');
    });

    it('rejects mode=2 with bps=1001', () => {
        expect(() => createVault({ mode: 2, bps: 1001, lockBlocks: 1000n })).toThrow('BPS must be 1-1000');
    });

    it('rejects lockBlocks > 52560 (MAX_LOCK_BLOCKS)', () => {
        expect(() => createVault({ mode: 1, bps: 0, lockBlocks: 52_561n })).toThrow('Lock period exceeds maximum (52560 blocks)');
    });

    it('accepts lockBlocks = 52560 (exactly at cap)', () => {
        const cfg = createVault({ mode: 1, bps: 0, lockBlocks: 52_560n });
        expect(cfg.lockBlocks).toBe(52_560n);
    });
});

// ── Tests: claimFaucet ────────────────────────────────────────────────────────

describe('claimFaucet', () => {
    it('succeeds on first claim and returns FAUCET_AMOUNT', () => {
        const claimed = new Map<string, boolean>();
        const amount = claimFaucet(claimed, 'user1');
        expect(amount).toBe(FAUCET_AMOUNT);
        expect(claimed.get('user1')).toBe(true);
    });

    it('reverts on second claim from same address', () => {
        const claimed = new Map<string, boolean>();
        claimFaucet(claimed, 'user1');
        expect(() => claimFaucet(claimed, 'user1')).toThrow('Faucet already claimed');
    });

    it('allows different users to each claim once', () => {
        const claimed = new Map<string, boolean>();
        const a1 = claimFaucet(claimed, 'user1');
        const a2 = claimFaucet(claimed, 'user2');
        expect(a1).toBe(FAUCET_AMOUNT);
        expect(a2).toBe(FAUCET_AMOUNT);
    });
});

// ── Tests: unlocked vault ─────────────────────────────────────────────────────

describe('unlocked vault (lockBlocks=0)', () => {
    const config: VaultConfig = { mode: 1, bps: 0, lockBlocks: 0n };

    it('createVault succeeds with lockBlocks=0', () => {
        const cfg = createVault(config);
        expect(cfg.lockBlocks).toBe(0n);
    });

    it('first swap sets unlockBlock = currentBlock + 0 = currentBlock', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        const { position } = swapForDust(empty, config, 230_000_000n, 0n, 5000n);
        // unlockBlock = currentBlock + 0 = currentBlock = 5000
        expect(position.unlockBlock).toBe(5000n);
    });

    it('canWithdraw returns true immediately after first swap (same block)', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        const { position } = swapForDust(empty, config, 230_000_000n, 0n, 5000n);
        // currentBlock=5000, unlockBlock=5000 → ready
        expect(canWithdraw(position, 5000n)).toBe(true);
    });

    it('withdraw succeeds immediately after swap', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        const { position } = swapForDust(empty, config, 230_000_000n, 0n, 5000n);
        const { amount } = withdraw(position, 5000n);
        expect(amount).toBe(position.balance);
    });
});

// ── Tests: dust math ──────────────────────────────────────────────────────────

describe('Dust math', () => {
    it('2.3 BANK → 2.3 PIGGY total (230_000_000 base units)', () => {
        const bankAmt = 230_000_000n; // 2.3 BANK
        const piggyTotal = calcPiggyTotal(bankAmt);
        expect(piggyTotal).toBe(529_000_000n);
    });

    it('mode=1 (round-up): remainder = 29_000_000, dust = 71_000_000', () => {
        const piggyTotal = 529_000_000n;
        const dust = calcDust(piggyTotal, 1, 0);
        expect(dust).toBe(71_000_000n);
    });

    it('mode=1: no dust when already whole number of PIGGY', () => {
        const piggyTotal = 500_000_000n;
        const dust = calcDust(piggyTotal, 1, 0);
        expect(dust).toBe(0n);
    });

    it('mode=2 (1%): dust = 1% of total', () => {
        const bankAmt = 1_000_000_000n;
        const piggyTotal = calcPiggyTotal(bankAmt);
        const dust = calcDust(piggyTotal, 2, 100);
        expect(dust).toBe(23_000_000n);
    });

    it('mode=2 (10% = 1000 bps): dust = 10% of total', () => {
        const bankAmt = 1_000_000_000n;
        const piggyTotal = calcPiggyTotal(bankAmt);
        const dust = calcDust(piggyTotal, 2, 1000);
        expect(dust).toBe(230_000_000n);
    });
});

// ── Tests: swapForDust ────────────────────────────────────────────────────────

describe('swapForDust (mode=1 round-up)', () => {
    const config: VaultConfig = { mode: 1, bps: 0, lockBlocks: 1000n };

    it('first swap creates position with unlockBlock', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        const { position, piggyToWallet, dust } = swapForDust(empty, config, 230_000_000n, 0n, 5000n);

        expect(dust).toBe(71_000_000n);
        expect(piggyToWallet).toBe(458_000_000n);
        expect(position.balance).toBe(71_000_000n);
        expect(position.unlockBlock).toBe(6000n); // 5000 + 1000
        expect(position.depositCount).toBe(1n);
    });

    it('second swap adds to balance, lock unchanged', () => {
        const after1: Position = { balance: 71_000_000n, unlockBlock: 6000n, depositCount: 1n };
        const { position, dust } = swapForDust(after1, config, 230_000_000n, 0n, 5100n);

        expect(dust).toBe(71_000_000n);
        expect(position.balance).toBe(142_000_000n);
        expect(position.unlockBlock).toBe(6000n);
        expect(position.depositCount).toBe(2n);
    });

    it('rejects zero bankAmount', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        expect(() => swapForDust(empty, config, 0n, 0n, 5000n)).toThrow('Amount must be > 0');
    });

    it('rejects slippage (guards piggyToWallet, not piggyTotal)', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        const piggyToWallet = 529_000_000n - 71_000_000n; // 458_000_000
        expect(() => swapForDust(empty, config, 230_000_000n, piggyToWallet + 1n, 5000n)).toThrow('Slippage exceeded');
        expect(() => swapForDust(empty, config, 230_000_000n, 529_000_000n, 5000n)).toThrow('Slippage exceeded');
    });
});

describe('swapForDust (mode=2 fixed 1%)', () => {
    const config: VaultConfig = { mode: 2, bps: 100, lockBlocks: 2000n };

    it('10 BANK → 0.23 PIGGY dust, 22.77 PIGGY to wallet', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        const bankAmt = 1_000_000_000n;
        const { position, piggyToWallet, dust } = swapForDust(empty, config, bankAmt, 0n, 1000n);

        expect(dust).toBe(23_000_000n);
        expect(piggyToWallet).toBe(2_277_000_000n);
        expect(position.balance).toBe(23_000_000n);
        expect(position.unlockBlock).toBe(3000n);
    });
});

// ── Tests: withdraw ───────────────────────────────────────────────────────────

describe('withdraw', () => {
    it('succeeds at exactly unlockBlock', () => {
        const pos: Position = { balance: 71_000_000n, unlockBlock: 6000n, depositCount: 1n };
        const { amount, position } = withdraw(pos, 6000n);
        expect(amount).toBe(71_000_000n);
        expect(position.balance).toBe(0n);
    });

    it('succeeds when block > unlockBlock', () => {
        const pos: Position = { balance: 71_000_000n, unlockBlock: 6000n, depositCount: 1n };
        const { amount } = withdraw(pos, 99999n);
        expect(amount).toBe(71_000_000n);
    });

    it('rejects when still locked', () => {
        const pos: Position = { balance: 71_000_000n, unlockBlock: 6000n, depositCount: 1n };
        expect(() => withdraw(pos, 5999n)).toThrow('Still locked');
    });

    it('rejects empty position', () => {
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };
        expect(() => withdraw(empty, 9999n)).toThrow('No position to withdraw');
    });
});

// ── Tests: canWithdraw ────────────────────────────────────────────────────────

describe('canWithdraw', () => {
    it('false for empty position', () => {
        expect(canWithdraw({ balance: 0n, unlockBlock: 0n, depositCount: 0n }, 9999n)).toBe(false);
    });

    it('false when still locked', () => {
        expect(canWithdraw({ balance: 71_000_000n, unlockBlock: 6000n, depositCount: 1n }, 5999n)).toBe(false);
    });

    it('true at exactly unlock block', () => {
        expect(canWithdraw({ balance: 71_000_000n, unlockBlock: 6000n, depositCount: 1n }, 6000n)).toBe(true);
    });
});

// ── Tests: TVL tracking ───────────────────────────────────────────────────────

describe('TVL tracking', () => {
    it('accumulates correctly across multiple swaps', () => {
        const config: VaultConfig = { mode: 2, bps: 100, lockBlocks: 1000n };
        const empty: Position = { balance: 0n, unlockBlock: 0n, depositCount: 0n };

        const swap1 = swapForDust(empty, config, 1_000_000_000n, 0n, 0n);
        const swap2 = swapForDust(swap1.position, config, 1_000_000_000n, 0n, 100n);

        expect(swap2.position.balance).toBe(swap1.dust + swap2.dust);
        expect(swap2.position.depositCount).toBe(2n);
    });

    it('TVL decreases on withdraw', () => {
        const pos: Position = { balance: 100_000_000n, unlockBlock: 100n, depositCount: 3n };
        const { amount, position } = withdraw(pos, 100n);
        expect(amount).toBe(100_000_000n);
        expect(position.balance).toBe(0n);
    });
});
