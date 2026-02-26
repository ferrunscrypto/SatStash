import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const SatStashPoolEvents = [];

export const SatStashPoolAbi = [
    {
        name: 'initializeLiquidity',
        inputs: [
            { name: 'bankAmount', type: ABIDataTypes.UINT256 },
            { name: 'piggyAmount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'swap',
        inputs: [
            { name: 'amountIn', type: ABIDataTypes.UINT256 },
            { name: 'swapBankToPiggy', type: ABIDataTypes.BOOL },
            { name: 'minAmountOut', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'amountOut', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getAmountOut',
        inputs: [
            { name: 'amountIn', type: ABIDataTypes.UINT256 },
            { name: 'swapBankToPiggy', type: ABIDataTypes.BOOL },
        ],
        outputs: [{ name: 'amountOut', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getReserves',
        inputs: [],
        outputs: [
            { name: 'bankReserve', type: ABIDataTypes.UINT256 },
            { name: 'piggyReserve', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...SatStashPoolEvents,
    ...OP_NET_ABI,
];

export default SatStashPoolAbi;
