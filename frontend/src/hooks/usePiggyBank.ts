import { useMemo } from 'react';
import { getContract } from 'opnet';
import { Address } from '@btc-vision/transaction';
import { Network } from '@btc-vision/bitcoin';
import { useProvider } from './useProvider';
import { PIGGY_BANK_ABI, ERC20_APPROVE_ABI } from '../abi/PiggyBankABI';
import { BANK_TOKEN_ABI } from '../abi/BankTokenABI';
import { SATSTASH_POOL_ABI } from '../abi/SatStashPoolABI';
import { getContractAddress } from '../config/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyContract = any;

export function usePiggyBankContract(
    network: Network | null | undefined,
    from?: Address,
): AnyContract | null {
    const provider = useProvider(network);

    return useMemo(() => {
        if (!network || !provider) return null;

        const address = getContractAddress('piggyBank', network);
        if (!address) return null;

        return getContract<AnyContract>(
            address,
            PIGGY_BANK_ABI,
            provider,
            network,
            from,
        );
    }, [network, provider, from]);
}

export function useBankTokenContract(
    network: Network | null | undefined,
    from?: Address,
): AnyContract | null {
    const provider = useProvider(network);

    return useMemo(() => {
        if (!network || !provider) return null;

        const address = getContractAddress('bankToken', network);
        if (!address) return null;

        return getContract<AnyContract>(
            address,
            BANK_TOKEN_ABI,
            provider,
            network,
            from,
        );
    }, [network, provider, from]);
}

export function usePoolContract(
    network: Network | null | undefined,
    from?: Address,
): AnyContract | null {
    const provider = useProvider(network);

    return useMemo(() => {
        if (!network || !provider) return null;

        const address = getContractAddress('pool', network);
        if (!address) return null;

        return getContract<AnyContract>(
            address,
            SATSTASH_POOL_ABI,
            provider,
            network,
            from,
        );
    }, [network, provider, from]);
}

/** Legacy: kept for any code still referencing useMotoContract */
export function useMotoContract(
    network: Network | null | undefined,
    from?: Address,
): AnyContract | null {
    const provider = useProvider(network);

    return useMemo(() => {
        if (!network || !provider) return null;

        // In the new design, the "input token" for swaps is BANK, not MOTO.
        // This hook is kept for backward compatibility but returns bankToken contract.
        const address = getContractAddress('bankToken', network);
        if (!address) return null;

        return getContract<AnyContract>(
            address,
            ERC20_APPROVE_ABI,
            provider,
            network,
            from,
        );
    }, [network, provider, from]);
}
