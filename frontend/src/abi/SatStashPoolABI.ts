import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi } from 'opnet';

export const SATSTASH_POOL_ABI: BitcoinInterfaceAbi = [
    {
        name: 'initializeLiquidity',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'bankAmount',  type: ABIDataTypes.UINT256 },
            { name: 'piggyAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'swap',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'amountIn',         type: ABIDataTypes.UINT256 },
            { name: 'swapBankToPiggy',  type: ABIDataTypes.BOOL },
            { name: 'minAmountOut',     type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'amountOut', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getAmountOut',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'amountIn',        type: ABIDataTypes.UINT256 },
            { name: 'swapBankToPiggy', type: ABIDataTypes.BOOL },
        ],
        outputs: [
            { name: 'amountOut', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getReserves',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'bankReserve',  type: ABIDataTypes.UINT256 },
            { name: 'piggyReserve', type: ABIDataTypes.UINT256 },
        ],
    },
];
