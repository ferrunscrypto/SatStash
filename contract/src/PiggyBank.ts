import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
    Revert,
    StoredAddress,
    StoredU256,
    SafeMath,
    EMPTY_POINTER,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { AddressMemoryMap } from '@btc-vision/btc-runtime/runtime/memory/AddressMemoryMap';
import { NetEvent } from '@btc-vision/btc-runtime/runtime/events/NetEvent';

// ── Faucet Event ─────────────────────────────────────────────────────────────

class FaucetClaimedEvent extends NetEvent {
    constructor(user: Address, amount: u256) {
        const data = new BytesWriter(64);
        data.writeAddress(user);
        data.writeU256(amount);
        super('FaucetClaimed', data);
    }
}

// ── Events ──────────────────────────────────────────────────────────────────

class VaultCreatedEvent extends NetEvent {
    constructor(user: Address, mode: u256, bps: u256, lockBlocks: u256) {
        // user(32) + mode(32) + bps(32) + lockBlocks(32) = 128 bytes
        const data = new BytesWriter(128);
        data.writeAddress(user);
        data.writeU256(mode);
        data.writeU256(bps);
        data.writeU256(lockBlocks);
        super('VaultCreated', data);
    }
}

class SwapExecutedEvent extends NetEvent {
    constructor(user: Address, bankAmt: u256, piggyOut: u256, dust: u256) {
        // user(32) + bankAmt(32) + piggyOut(32) + dust(32) = 128 bytes
        const data = new BytesWriter(128);
        data.writeAddress(user);
        data.writeU256(bankAmt);
        data.writeU256(piggyOut);
        data.writeU256(dust);
        super('SwapExecuted', data);
    }
}

class WithdrawnEvent extends NetEvent {
    constructor(user: Address, amount: u256) {
        // user(32) + amount(32) = 64 bytes
        const data = new BytesWriter(64);
        data.writeAddress(user);
        data.writeU256(amount);
        super('Withdrawn', data);
    }
}

// ── Constants ────────────────────────────────────────────────────────────────

// 500M × 10^8
const PIGGY_MAX_SUPPLY: u256 = u256.fromString('50000000000000000');

// 1 PIGGY unit = 10^8
const PIGGY_UNIT: u256 = u256.fromU64(100_000_000);

// Faucet: 100K PIGGY (100_000 × 10^8)
const FAUCET_AMOUNT: u256 = u256.fromString('10000000000000');

// Rate: 1 BANK → 2.3 PIGGY  (rate = 23/10)
const RATE_NUM: u256 = u256.fromU64(23);
const RATE_DEN: u256 = u256.fromU64(10);

// Max lock ≈ 1 year at ~6 BTC blocks/hour  (6 × 24 × 365 = 52_560)
const MAX_LOCK_BLOCKS: u256 = u256.fromU64(52_560);

/**
 * PiggyBank — Extends OP20 (IS the PIGGY token) + Time-Locked Dust Vault.
 *
 * Users configure a vault (mode + lock period), then swap BANK for PIGGY.
 * A portion of PIGGY is saved as "dust" into their time-locked vault.
 * The remaining PIGGY goes directly to their wallet.
 *
 * Storage layout
 * ──────────────
 *  (OP20/ReentrancyGuard uses pointers P0–P8 internally)
 *
 *  Per-contract singletons:
 *  Px   bankToken         StoredAddress
 *  Px+1 totalLocked       StoredU256
 *
 *  Per-user (AddressMemoryMap, keyed by Address):
 *  Px+2  userBalance[addr]       ← locked PIGGY amount
 *  Px+3  userUnlockBlock[addr]   ← block height when withdrawable
 *  Px+4  userDepositCount[addr]  ← total swaps that created dust
 *  Px+5  userDustMode[addr]      ← 1=round-up, 2=fixed%
 *  Px+6  userDustBps[addr]       ← basis points for mode=2 (1–1000)
 *  Px+7  userLockBlocks[addr]    ← chosen lock duration
 */
export class PiggyBank extends OP20 {

    // ── Global storage pointers ──────────────────────────────────────────────
    private readonly _bankTokenPointer: u16    = Blockchain.nextPointer;
    private readonly _totalLockedPointer: u16  = Blockchain.nextPointer;

    // ── Per-user storage pointers ────────────────────────────────────────────
    private readonly _userBalancePointer: u16      = Blockchain.nextPointer;
    private readonly _userUnlockBlockPointer: u16  = Blockchain.nextPointer;
    private readonly _userDepositCountPointer: u16 = Blockchain.nextPointer;
    private readonly _userDustModePointer: u16     = Blockchain.nextPointer;
    private readonly _userDustBpsPointer: u16      = Blockchain.nextPointer;
    private readonly _userLockBlocksPointer: u16   = Blockchain.nextPointer;
    private readonly _claimedPointer: u16           = Blockchain.nextPointer;

    // ── Global state ─────────────────────────────────────────────────────────
    private readonly bankToken: StoredAddress  = new StoredAddress(this._bankTokenPointer);
    private readonly totalLocked: StoredU256   = new StoredU256(this._totalLockedPointer, EMPTY_POINTER);

    // ── Per-user maps ─────────────────────────────────────────────────────────
    private readonly userBalance: AddressMemoryMap      = new AddressMemoryMap(this._userBalancePointer);
    private readonly userUnlockBlock: AddressMemoryMap  = new AddressMemoryMap(this._userUnlockBlockPointer);
    private readonly userDepositCount: AddressMemoryMap = new AddressMemoryMap(this._userDepositCountPointer);
    private readonly userDustMode: AddressMemoryMap     = new AddressMemoryMap(this._userDustModePointer);
    private readonly userDustBps: AddressMemoryMap      = new AddressMemoryMap(this._userDustBpsPointer);
    private readonly userLockBlocks: AddressMemoryMap   = new AddressMemoryMap(this._userLockBlocksPointer);
    private readonly claimed: AddressMemoryMap          = new AddressMemoryMap(this._claimedPointer);

    public constructor() {
        super();
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    public override onDeployment(calldata: Calldata): void {
        const bankAddress: Address = calldata.readAddress();
        if (bankAddress.isZero()) {
            throw new Revert('Bank token address cannot be zero');
        }

        this.bankToken.value = bankAddress;
        this.instantiate(new OP20InitParameters(
            PIGGY_MAX_SUPPLY,
            8,
            'Piggy',
            'PIGGY',
        ));
        this.totalLocked.value = u256.Zero;
    }

    // ── createVault(mode, bps, lockBlocks) → success ─────────────────────────

    @method(
        { name: 'mode', type: ABIDataTypes.UINT8 },
        { name: 'bps', type: ABIDataTypes.UINT16 },
        { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private createVault(calldata: Calldata): BytesWriter {
        const mode: u256 = u256.fromU64(u64(calldata.readU8()));
        const bps: u256  = u256.fromU64(u64(calldata.readU16()));
        const lockBlocks: u256 = calldata.readU256();

        // Checks
        if (mode != u256.One && mode != u256.fromU64(2)) {
            throw new Revert('Mode must be 1 or 2');
        }
        if (mode == u256.fromU64(2)) {
            if (bps == u256.Zero || bps > u256.fromU64(1000)) {
                throw new Revert('BPS must be 1-1000');
            }
        }
        if (lockBlocks > u256.Zero && lockBlocks > MAX_LOCK_BLOCKS) {
            throw new Revert('Lock period exceeds maximum (52560 blocks)');
        }

        const sender: Address = Blockchain.tx.sender;
        if (!this.userDustMode.get(sender).isZero()) {
            throw new Revert('Vault already exists');
        }

        // Effects
        this.userDustMode.set(sender, mode);
        this.userDustBps.set(sender, bps);
        this.userLockBlocks.set(sender, lockBlocks);

        Blockchain.emit(new VaultCreatedEvent(sender, mode, bps, lockBlocks));

        const w = new BytesWriter(1);
        w.writeBoolean(true);
        return w;
    }

    // ── swapForDust(bankAmount, minPiggyOut) → (piggyToWallet, dustToVault) ──

    @method(
        { name: 'bankAmount', type: ABIDataTypes.UINT256 },
        { name: 'minPiggyOut', type: ABIDataTypes.UINT256 },
    )
    @returns(
        { name: 'piggyToWallet', type: ABIDataTypes.UINT256 },
        { name: 'dustToVault', type: ABIDataTypes.UINT256 },
    )
    private swapForDust(calldata: Calldata): BytesWriter {
        const bankAmount: u256    = calldata.readU256();
        const minPiggyOut: u256   = calldata.readU256();

        // Checks
        if (bankAmount == u256.Zero) {
            throw new Revert('Amount must be > 0');
        }

        const sender: Address = Blockchain.tx.sender;
        const mode: u256 = this.userDustMode.get(sender);

        if (mode == u256.Zero) {
            throw new Revert('Create vault first');
        }

        const lockBlocks: u256 = this.userLockBlocks.get(sender);
        const bps: u256  = this.userDustBps.get(sender);

        // Compute swap output
        // piggyTotal = bankAmount × 23 / 10
        const piggyTotal: u256 = SafeMath.div(
            SafeMath.mul(bankAmount, RATE_NUM),
            RATE_DEN,
        );

        // Compute dust amount
        let dust: u256;
        if (mode == u256.One) {
            // Mode 1: round-up dust — dust is the fractional part to the next PIGGY_UNIT
            const remainder: u256 = SafeMath.mod(piggyTotal, PIGGY_UNIT);
            if (remainder == u256.Zero) {
                dust = u256.Zero;
            } else {
                dust = SafeMath.sub(PIGGY_UNIT, remainder);
            }
        } else {
            // Mode 2: fixed% — dust = piggyTotal × bps / 10000
            dust = SafeMath.div(
                SafeMath.mul(piggyTotal, bps),
                u256.fromU64(10000),
            );
        }

        const piggyToWallet: u256 = SafeMath.sub(piggyTotal, dust);

        // Slippage check — guard the amount that actually reaches the user's wallet
        if (piggyToWallet < minPiggyOut) {
            throw new Revert('Slippage exceeded');
        }

        // Update vault state (Effects before Interactions)
        const currentBalance: u256 = this.userBalance.get(sender);
        const currentBlock: u256   = u256.fromU64(Blockchain.block.number);

        if (dust > u256.Zero) {
            if (currentBalance == u256.Zero) {
                // First dust — create vault position
                this.userUnlockBlock.set(sender, SafeMath.add(currentBlock, lockBlocks));
                this.userDepositCount.set(sender, u256.One);
            } else {
                // Top-up — preserve lock, increment count
                this.userDepositCount.set(sender, SafeMath.add(this.userDepositCount.get(sender), u256.One));
            }
            this.userBalance.set(sender, SafeMath.add(currentBalance, dust));
            this.totalLocked.value = SafeMath.add(this.totalLocked.value, dust);
        }

        Blockchain.emit(new SwapExecutedEvent(sender, bankAmount, piggyToWallet, dust));

        // Interactions (after all effects)
        // 1. Pull BANK from sender to this contract
        const bank: Address = this.bankToken.value;
        const contractAddr: Address = Blockchain.contractAddress;
        TransferHelper.transferFrom(bank, sender, contractAddr, bankAmount);

        // 2. Mint PIGGY directly to sender's wallet
        if (piggyToWallet > u256.Zero) {
            this._mint(sender, piggyToWallet);
        }

        // 3. Mint PIGGY dust to vault (this contract holds it on behalf of user)
        if (dust > u256.Zero) {
            this._mint(contractAddr, dust);
        }

        const w = new BytesWriter(64);
        w.writeU256(piggyToWallet);
        w.writeU256(dust);
        return w;
    }

    // ── withdraw() → amount ───────────────────────────────────────────────────

    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    private withdraw(_calldata: Calldata): BytesWriter {
        const sender: Address  = Blockchain.tx.sender;
        const balance: u256    = this.userBalance.get(sender);

        if (balance == u256.Zero) {
            throw new Revert('No position to withdraw');
        }

        const unlockBlock: u256  = this.userUnlockBlock.get(sender);
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);

        if (currentBlock < unlockBlock) {
            throw new Revert('Still locked');
        }

        // Effects — zero out position before transfer
        this.userBalance.set(sender, u256.Zero);
        this.userUnlockBlock.set(sender, u256.Zero);
        this.userDepositCount.set(sender, u256.Zero);
        this.totalLocked.value = SafeMath.sub(this.totalLocked.value, balance);

        Blockchain.emit(new WithdrawnEvent(sender, balance));

        // Interaction — transfer PIGGY from vault (self) to user
        this._transfer(Blockchain.contractAddress, sender, balance);

        const w = new BytesWriter(32);
        w.writeU256(balance);
        return w;
    }

    // ── View: getPosition(addr) → (balance, unlockBlock, depositCount) ────────

    @method({ name: 'addr', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'balance', type: ABIDataTypes.UINT256 },
        { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
        { name: 'depositCount', type: ABIDataTypes.UINT256 },
    )
    private getPosition(calldata: Calldata): BytesWriter {
        const addr: Address = calldata.readAddress();

        const balance: u256      = this.userBalance.get(addr);
        const unlockBlock: u256  = this.userUnlockBlock.get(addr);
        const depositCount: u256 = this.userDepositCount.get(addr);

        const w = new BytesWriter(96);
        w.writeU256(balance);
        w.writeU256(unlockBlock);
        w.writeU256(depositCount);
        return w;
    }

    // ── View: getTotalLocked() → total ────────────────────────────────────────

    @method()
    @returns({ name: 'total', type: ABIDataTypes.UINT256 })
    private getTotalLocked(_calldata: Calldata): BytesWriter {
        const w = new BytesWriter(32);
        w.writeU256(this.totalLocked.value);
        return w;
    }

    // ── View: canWithdraw(addr) → ready ───────────────────────────────────────

    @method({ name: 'addr', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'ready', type: ABIDataTypes.BOOL })
    private canWithdraw(calldata: Calldata): BytesWriter {
        const addr: Address = calldata.readAddress();

        const balance: u256      = this.userBalance.get(addr);
        const unlockBlock: u256  = this.userUnlockBlock.get(addr);
        const currentBlock: u256 = u256.fromU64(Blockchain.block.number);

        // balance > 0 guard prevents a false-positive: after withdraw(), both
        // userBalance and userUnlockBlock are zeroed, so currentBlock >= 0 would
        // always be true without this check.
        const ready: bool = balance > u256.Zero && currentBlock >= unlockBlock;

        const w = new BytesWriter(1);
        w.writeBoolean(ready);
        return w;
    }

    // ── claimFaucet() → amount ────────────────────────────────────────────────

    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    private claimFaucet(_calldata: Calldata): BytesWriter {
        const sender: Address = Blockchain.tx.sender;

        if (!this.claimed.get(sender).isZero()) {
            throw new Revert('Faucet already claimed');
        }

        this.claimed.set(sender, u256.One);
        this._mint(sender, FAUCET_AMOUNT);

        Blockchain.emit(new FaucetClaimedEvent(sender, FAUCET_AMOUNT));

        const w = new BytesWriter(32);
        w.writeU256(FAUCET_AMOUNT);
        return w;
    }

    // ── View: getDustConfig(addr) → (mode, bps, lockBlocks) ──────────────────

    @method({ name: 'addr', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'mode', type: ABIDataTypes.UINT256 },
        { name: 'bps', type: ABIDataTypes.UINT256 },
        { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
    )
    private getDustConfig(calldata: Calldata): BytesWriter {
        const addr: Address = calldata.readAddress();

        const mode: u256       = this.userDustMode.get(addr);
        const bps: u256        = this.userDustBps.get(addr);
        const lockBlocks: u256 = this.userLockBlocks.get(addr);

        const w = new BytesWriter(96);
        w.writeU256(mode);
        w.writeU256(bps);
        w.writeU256(lockBlocks);
        return w;
    }
}
