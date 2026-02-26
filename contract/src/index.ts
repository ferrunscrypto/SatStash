import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { PiggyBank } from './PiggyBank';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';

// Factory function - REQUIRED
Blockchain.contract = (): PiggyBank => {
    return new PiggyBank();
};

// Runtime exports - REQUIRED
export * from '@btc-vision/btc-runtime/runtime/exports';

// Abort handler - REQUIRED
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
