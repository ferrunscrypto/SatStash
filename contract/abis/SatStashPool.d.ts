import { Address, AddressMap, ExtendedAddressMap, SchnorrSignature } from '@btc-vision/transaction';
import { CallResult, OPNetEvent, IOP_NETContract } from 'opnet';

// ------------------------------------------------------------------
// Event Definitions
// ------------------------------------------------------------------

// ------------------------------------------------------------------
// Call Results
// ------------------------------------------------------------------

/**
 * @description Represents the result of the initializeLiquidity function call.
 */
export type InitializeLiquidity = CallResult<
    {
        success: boolean;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the swap function call.
 */
export type Swap = CallResult<
    {
        amountOut: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getAmountOut function call.
 */
export type GetAmountOut = CallResult<
    {
        amountOut: bigint;
    },
    OPNetEvent<never>[]
>;

/**
 * @description Represents the result of the getReserves function call.
 */
export type GetReserves = CallResult<
    {
        bankReserve: bigint;
        piggyReserve: bigint;
    },
    OPNetEvent<never>[]
>;

// ------------------------------------------------------------------
// ISatStashPool
// ------------------------------------------------------------------
export interface ISatStashPool extends IOP_NETContract {
    initializeLiquidity(bankAmount: bigint, piggyAmount: bigint): Promise<InitializeLiquidity>;
    swap(amountIn: bigint, swapBankToPiggy: boolean, minAmountOut: bigint): Promise<Swap>;
    getAmountOut(amountIn: bigint, swapBankToPiggy: boolean): Promise<GetAmountOut>;
    getReserves(): Promise<GetReserves>;
}
