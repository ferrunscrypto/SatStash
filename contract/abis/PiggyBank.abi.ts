import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const PiggyBankEvents = [];

export const PiggyBankAbi = [
    {
        name: 'createVault',
        inputs: [
            { name: 'mode', type: ABIDataTypes.UINT8 },
            { name: 'bps', type: ABIDataTypes.UINT16 },
            { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
        ],
        outputs: [{ name: 'success', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'swapForDust',
        inputs: [
            { name: 'bankAmount', type: ABIDataTypes.UINT256 },
            { name: 'minPiggyOut', type: ABIDataTypes.UINT256 },
        ],
        outputs: [
            { name: 'piggyToWallet', type: ABIDataTypes.UINT256 },
            { name: 'dustToVault', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'withdraw',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getPosition',
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'balance', type: ABIDataTypes.UINT256 },
            { name: 'unlockBlock', type: ABIDataTypes.UINT256 },
            { name: 'depositCount', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getTotalLocked',
        inputs: [],
        outputs: [{ name: 'total', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'canWithdraw',
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [{ name: 'ready', type: ABIDataTypes.BOOL }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'claimFaucet',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    {
        name: 'getDustConfig',
        inputs: [{ name: 'addr', type: ABIDataTypes.ADDRESS }],
        outputs: [
            { name: 'mode', type: ABIDataTypes.UINT256 },
            { name: 'bps', type: ABIDataTypes.UINT256 },
            { name: 'lockBlocks', type: ABIDataTypes.UINT256 },
        ],
        type: BitcoinAbiTypes.Function,
    },
    ...PiggyBankEvents,
    ...OP_NET_ABI,
];

export default PiggyBankAbi;
