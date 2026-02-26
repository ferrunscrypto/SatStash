import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the createVault function call.
 */
export type CreateVault = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the swapForDust function call.
 */
export type SwapForDust = CallResult<
    {
        piggyToWallet: bigint;
        dustToVault: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the withdraw function call.
 */
export type Withdraw = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getPosition function call.
 */
export type GetPosition = CallResult<
    {
        balance: bigint;
        unlockBlock: bigint;
        depositCount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getTotalLocked function call.
 */
export type GetTotalLocked = CallResult<
    {
        total: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the canWithdraw function call.
 */
export type CanWithdraw = CallResult<
    {
        ready: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the claimFaucet function call.
 */
export type ClaimFaucet = CallResult<
    {
        amount: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getDustConfig function call.
 */
export type GetDustConfig = CallResult<
    {
        mode: bigint;
        bps: bigint;
        lockBlocks: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// IPiggyBank
// ------------------------------------------------------------------
export interface IPiggyBank extends IOP_NETContract {
    createVault(mode: number, bps: number, lockBlocks: bigint): Promise<CreateVault>;
    swapForDust(bankAmount: bigint, minPiggyOut: bigint): Promise<SwapForDust>;
    withdraw(): Promise<Withdraw>;
    getPosition(addr: Address): Promise<GetPosition>;
    getTotalLocked(): Promise<GetTotalLocked>;
    canWithdraw(addr: Address): Promise<CanWithdraw>;
    claimFaucet(): Promise<ClaimFaucet>;
    getDustConfig(addr: Address): Promise<GetDustConfig>;
}
