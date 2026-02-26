import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi } from 'opnet';

export const BANK_TOKEN_ABI: BitcoinInterfaceAbi = [
    // ── Write Methods ─────────────────────────────────────────
    {
        name: 'claimFaucet',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'approve',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'transfer',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'transferFrom',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'from', type: ABIDataTypes.ADDRESS },
            { name: 'to', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },

    // ── Read Methods ──────────────────────────────────────────
    {
        name: 'balanceOf',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'account', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'balance', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'allowance',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'owner', type: ABIDataTypes.ADDRESS },
            { name: 'spender', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'remaining', type: ABIDataTypes.UINT256 },
        ],
    },
];
