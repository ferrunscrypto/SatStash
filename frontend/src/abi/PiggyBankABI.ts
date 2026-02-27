import { ABIDataTypes, BitcoinAbiTypes, BitcoinInterfaceAbi } from 'opnet';

export const PIGGY_BANK_ABI: BitcoinInterfaceAbi = [
    // ── Write Methods ─────────────────────────────────────────
    {
        name: 'createVault',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'mode', type: ABIDataTypes.UINT8 },
            { name: 'bps', type: ABIDataTypes.UINT16 },
            { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'swapForDust',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'bankAmount', type: ABIDataTypes.UINT256 },
            { name: 'minPiggyOut', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'piggyToWallet', type: ABIDataTypes.UINT256 },
            { name: 'dustToVault', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'swapPiggyForBank',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'piggyAmount', type: ABIDataTypes.UINT256 },
            { name: 'minBankOut', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'bankToWallet', type: ABIDataTypes.UINT256 },
            { name: 'dustToVault', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'depositToVault',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'success', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'withdraw',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'claimFaucet',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
    },

    // ── Read Methods ──────────────────────────────────────────
    {
        name: 'getPosition',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'addr', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'balance', type: ABIDataTypes.UINT256 },
            { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
            { name: 'depositCount', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'getTotalLocked',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [],
        outputs: [
            { name: 'total', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'canWithdraw',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'addr', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'ready', type: ABIDataTypes.BOOL },
        ],
    },
    {
        name: 'getDustConfig',
        type: BitcoinAbiTypes.Function,
        constant: true,
        inputs: [
            { name: 'addr', type: ABIDataTypes.ADDRESS },
        ],
        outputs: [
            { name: 'mode', type: ABIDataTypes.UINT256 },
            { name: 'bps', type: ABIDataTypes.UINT256 },
            { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
        ],
    },
    {
        name: 'increaseAllowance',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    // ── OP20 standard methods ─────────────────────────────────
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
];

// ── OP20 approve ABI (for token approve step before swap) ──
export const ERC20_APPROVE_ABI: BitcoinInterfaceAbi = [
    {
        name: 'increaseAllowance',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [
            { name: 'spender', type: ABIDataTypes.ADDRESS },
            { name: 'amount', type: ABIDataTypes.UINT256 },
        ],
        outputs: [],
    },
    {
        name: 'claimFaucet',
        type: BitcoinAbiTypes.Function,
        constant: false,
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
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
];
