import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Revert,
    StoredAddress,
    StoredU256,
    SafeMath,
    EMPTY_POINTER,
    TransferHelper,
} from '@btc-vision/btc-runtime/runtime';
import { NetEvent } from '@btc-vision/btc-runtime/runtime/events/NetEvent';

// ── Events ──────────────────────────────────────────────────────────────────

class LiquidityAddedEvent extends NetEvent {
    constructor(bankAmount: u256, piggyAmount: u256) {
        const data = new BytesWriter(64);
        data.writeU256(bankAmount);
        data.writeU256(piggyAmount);
        super('LiquidityAdded', data);
    }
}

class SwapEvent extends NetEvent {
    constructor(
        sender: Address,
        amountIn: u256,
        amountOut: u256,
        swapBankToPiggy: bool,
    ) {
        const data = new BytesWriter(97); // 32+32+32+1
        data.writeAddress(sender);
        data.writeU256(amountIn);
        data.writeU256(amountOut);
        data.writeBoolean(swapBankToPiggy);
        super('Swap', data);
    }
}

// ── Constants ────────────────────────────────────────────────────────────────

const FEE_NUMERATOR: u256   = u256.fromU64(997);
const FEE_DENOMINATOR: u256 = u256.fromU64(1000);

/**
 * SatStashPool — Constant-product AMM for BANK ↔ PIGGY swaps.
 *
 * Storage layout (after OP_NET base):
 *  P0  bankToken       StoredAddress
 *  P1  piggyToken      StoredAddress
 *  P2  bankReserve     StoredU256
 *  P3  piggyReserve    StoredU256
 *  P4  initialized     StoredU256  (0=false, 1=true)
 *  P5  owner           StoredAddress
 */
export class SatStashPool extends OP_NET {

    private readonly _bankTokenPointer: u16   = Blockchain.nextPointer;
    private readonly _piggyTokenPointer: u16  = Blockchain.nextPointer;
    private readonly _bankReservePointer: u16 = Blockchain.nextPointer;
    private readonly _piggyReservePointer: u16 = Blockchain.nextPointer;
    private readonly _initializedPointer: u16 = Blockchain.nextPointer;
    private readonly _ownerPointer: u16       = Blockchain.nextPointer;

    private readonly bankToken: StoredAddress   = new StoredAddress(this._bankTokenPointer);
    private readonly piggyToken: StoredAddress  = new StoredAddress(this._piggyTokenPointer);
    private readonly bankReserve: StoredU256    = new StoredU256(this._bankReservePointer, EMPTY_POINTER);
    private readonly piggyReserve: StoredU256   = new StoredU256(this._piggyReservePointer, EMPTY_POINTER);
    private readonly initialized: StoredU256    = new StoredU256(this._initializedPointer, EMPTY_POINTER);
    private readonly owner: StoredAddress       = new StoredAddress(this._ownerPointer);

    public constructor() {
        super();
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    public override onDeployment(calldata: Calldata): void {
        const bankAddress: Address  = calldata.readAddress();
        const piggyAddress: Address = calldata.readAddress();

        if (bankAddress.isZero()) {
            throw new Revert('Bank token address cannot be zero');
        }
        if (piggyAddress.isZero()) {
            throw new Revert('Piggy token address cannot be zero');
        }

        this.bankToken.value  = bankAddress;
        this.piggyToken.value = piggyAddress;
        this.owner.value      = Blockchain.tx.sender;
        this.initialized.value = u256.Zero;
        this.bankReserve.value  = u256.Zero;
        this.piggyReserve.value = u256.Zero;
    }

    // ── initializeLiquidity(bankAmount, piggyAmount) ──────────────────────────

    @method(
        { name: 'bankAmount', type: ABIDataTypes.UINT256 },
        { name: 'piggyAmount', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    private initializeLiquidity(calldata: Calldata): BytesWriter {
        const bankAmount: u256  = calldata.readU256();
        const piggyAmount: u256 = calldata.readU256();

        const sender: Address = Blockchain.tx.sender;

        if (!this.owner.value.equals(sender)) {
            throw new Revert('Only owner can initialize liquidity');
        }
        if (!this.initialized.value.isZero()) {
            throw new Revert('Already initialized');
        }
        if (bankAmount == u256.Zero || piggyAmount == u256.Zero) {
            throw new Revert('Amounts must be > 0');
        }

        const contractAddr: Address = Blockchain.contractAddress;
        const bankAddr: Address     = this.bankToken.value;
        const piggyAddr: Address    = this.piggyToken.value;

        // Pull tokens from owner (Effects first)
        this.bankReserve.value  = bankAmount;
        this.piggyReserve.value = piggyAmount;
        this.initialized.value  = u256.One;

        Blockchain.emit(new LiquidityAddedEvent(bankAmount, piggyAmount));

        // Interactions
        TransferHelper.transferFrom(bankAddr, sender, contractAddr, bankAmount);
        TransferHelper.transferFrom(piggyAddr, sender, contractAddr, piggyAmount);

        const w = new BytesWriter(1);
        w.writeBoolean(true);
        return w;
    }

    // ── swap(amountIn, swapBankToPiggy, minAmountOut) → amountOut ────────────

    @method(
        { name: 'amountIn', type: ABIDataTypes.UINT256 },
        { name: 'swapBankToPiggy', type: ABIDataTypes.BOOL },
        { name: 'minAmountOut', type: ABIDataTypes.UINT256 },
    )
    @returns({ name: 'amountOut', type: ABIDataTypes.UINT256 })
    private swap(calldata: Calldata): BytesWriter {
        const amountIn: u256        = calldata.readU256();
        const swapBankToPiggy: bool = calldata.readBoolean();
        const minAmountOut: u256    = calldata.readU256();

        if (this.initialized.value != u256.One) {
            throw new Revert('Pool not initialized');
        }
        if (amountIn == u256.Zero) {
            throw new Revert('Amount must be > 0');
        }

        const reserveIn: u256  = swapBankToPiggy ? this.bankReserve.value  : this.piggyReserve.value;
        const reserveOut: u256 = swapBankToPiggy ? this.piggyReserve.value : this.bankReserve.value;

        // 0.3% fee: effectiveAmountIn = amountIn * 997 / 1000
        const effectiveIn: u256 = SafeMath.div(
            SafeMath.mul(amountIn, FEE_NUMERATOR),
            FEE_DENOMINATOR,
        );

        // amountOut = reserveOut * effectiveIn / (reserveIn + effectiveIn)
        const amountOut: u256 = SafeMath.div(
            SafeMath.mul(reserveOut, effectiveIn),
            SafeMath.add(reserveIn, effectiveIn),
        );

        if (amountOut < minAmountOut) {
            throw new Revert('Slippage exceeded');
        }
        if (amountOut >= reserveOut) {
            throw new Revert('Insufficient liquidity');
        }

        // CEI: Effects first — update reserves
        if (swapBankToPiggy) {
            this.bankReserve.value  = SafeMath.add(this.bankReserve.value, amountIn);
            this.piggyReserve.value = SafeMath.sub(this.piggyReserve.value, amountOut);
        } else {
            this.piggyReserve.value = SafeMath.add(this.piggyReserve.value, amountIn);
            this.bankReserve.value  = SafeMath.sub(this.bankReserve.value, amountOut);
        }

        const sender: Address       = Blockchain.tx.sender;
        const contractAddr: Address = Blockchain.contractAddress;

        Blockchain.emit(new SwapEvent(sender, amountIn, amountOut, swapBankToPiggy));

        // Interactions
        if (swapBankToPiggy) {
            TransferHelper.transferFrom(this.bankToken.value, sender, contractAddr, amountIn);
            TransferHelper.safeTransfer(this.piggyToken.value, sender, amountOut);
        } else {
            TransferHelper.transferFrom(this.piggyToken.value, sender, contractAddr, amountIn);
            TransferHelper.safeTransfer(this.bankToken.value, sender, amountOut);
        }

        const w = new BytesWriter(32);
        w.writeU256(amountOut);
        return w;
    }

    // ── View: getAmountOut(amountIn, swapBankToPiggy) → amountOut ────────────

    @method(
        { name: 'amountIn', type: ABIDataTypes.UINT256 },
        { name: 'swapBankToPiggy', type: ABIDataTypes.BOOL },
    )
    @returns({ name: 'amountOut', type: ABIDataTypes.UINT256 })
    private getAmountOut(calldata: Calldata): BytesWriter {
        const amountIn: u256        = calldata.readU256();
        const swapBankToPiggy: bool = calldata.readBoolean();

        if (amountIn == u256.Zero) {
            const w = new BytesWriter(32);
            w.writeU256(u256.Zero);
            return w;
        }

        const reserveIn: u256  = swapBankToPiggy ? this.bankReserve.value  : this.piggyReserve.value;
        const reserveOut: u256 = swapBankToPiggy ? this.piggyReserve.value : this.bankReserve.value;

        const effectiveIn: u256 = SafeMath.div(
            SafeMath.mul(amountIn, FEE_NUMERATOR),
            FEE_DENOMINATOR,
        );

        const amountOut: u256 = SafeMath.div(
            SafeMath.mul(reserveOut, effectiveIn),
            SafeMath.add(reserveIn, effectiveIn),
        );

        const w = new BytesWriter(32);
        w.writeU256(amountOut);
        return w;
    }

    // ── View: getReserves() → (bankReserve, piggyReserve) ────────────────────

    @method()
    @returns(
        { name: 'bankReserve', type: ABIDataTypes.UINT256 },
        { name: 'piggyReserve', type: ABIDataTypes.UINT256 },
    )
    private getReserves(_calldata: Calldata): BytesWriter {
        const w = new BytesWriter(64);
        w.writeU256(this.bankReserve.value);
        w.writeU256(this.piggyReserve.value);
        return w;
    }
}
