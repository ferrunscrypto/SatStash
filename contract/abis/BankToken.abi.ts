import { ABIDataTypes, BitcoinAbiTypes, OP_NET_ABI } from 'opnet';

export const BankTokenEvents = [];

export const BankTokenAbi = [
    {
        name: 'claimFaucet',
        inputs: [],
        outputs: [{ name: 'amount', type: ABIDataTypes.UINT256 }],
        type: BitcoinAbiTypes.Function,
    },
    ...BankTokenEvents,
    ...OP_NET_ABI,
];

export default BankTokenAbi;
