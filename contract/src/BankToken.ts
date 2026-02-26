import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
    Revert,
} from '@btc-vision/btc-runtime/runtime';
import { AddressMemoryMap } from '@btc-vision/btc-runtime/runtime/memory/AddressMemoryMap';

// Max supply: 2B × 10^8  (1B held by deployer + 1B reserved for faucet claims)
const MAX_SUPPLY: u256 = u256.fromString('200000000000000000');
// Deployer initial alloc: 1B × 10^8
const DEPLOYER_ALLOC: u256 = u256.fromString('100000000000000000');
// 100,000 × 10^8  (one-time faucet grant)
const FAUCET_AMOUNT: u256 = u256.fromString('10000000000000');

/**
 * BankToken — Standalone OP20 "BANK" token.
 *
 * All 1B BANK minted to deployer on deployment.
 * Users can call claimFaucet() once to receive 100,000 BANK for testing swaps.
 */
export class BankToken extends OP20 {

    // ── Per-user storage ──────────────────────────────────────────────────────
    private readonly _claimedPointer: u16 = Blockchain.nextPointer;
    private readonly claimed: AddressMemoryMap = new AddressMemoryMap(this._claimedPointer);

    public constructor() {
        super();
    }

    // ── Deployment ────────────────────────────────────────────────────────────

    public override onDeployment(_calldata: Calldata): void {
        this.instantiate(new OP20InitParameters(
            MAX_SUPPLY,
            8,
            'Bank',
            'BANK',
        ));
        this._mint(Blockchain.tx.sender, DEPLOYER_ALLOC);
    }

    // ── claimFaucet() → amount ────────────────────────────────────────────────

    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public claimFaucet(_calldata: Calldata): BytesWriter {
        const sender = Blockchain.tx.sender;

        if (!this.claimed.get(sender).isZero()) {
            throw new Revert('Already claimed');
        }

        this.claimed.set(sender, u256.One);
        this._mint(sender, FAUCET_AMOUNT);

        const w = new BytesWriter(32);
        w.writeU256(FAUCET_AMOUNT);
        return w;
    }
}
