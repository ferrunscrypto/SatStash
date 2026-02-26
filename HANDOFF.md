# SatStash — Agent Handoff Document

> Generated: 2026-02-26
> Status: Contracts deployed to testnet, frontend builds clean, 54/54 tests passing.
> Pending: Pool not deployed, pool ABI not wired to live addresses, cyberpunk images missing.

---

## 1. Project Overview

**SatStash** is an OPNet Bitcoin L1 dapp — a time-locked (or unlocked) savings vault where users accumulate $PIGGY tokens automatically via "dust" (round-up or fixed-%) from swaps. There is also a companion AMM pool contract (SatStashPool) for on-chain BANK↔PIGGY price discovery.

Root directory: `/mnt/c/Users/ferra/opnet_competition/piggy_bank/`

```
piggy_bank/
├── contract/           AssemblyScript smart contracts (built to WASM)
├── frontend/           React/Vite/Tailwind v4 frontend
├── scripts/            Deployment scripts (tsx)
├── deployments.json    On-chain deployment records
└── HANDOFF.md          This file
```

---

## 2. Deployed Contracts (Testnet)

| Contract | Address | Deployer |
|---|---|---|
| BankToken ($BANK) | `opt1sqp0rnuusemhqv3yyaa9y2alp0hryaucdsckqecde` | `opt1pq45c7qx5snvrgfv9drnlaspf2thzmrhzj5gr6cuk289n7dekaukqe7ps2r` |
| PiggyBank ($PIGGY) | `opt1sqrurj6ynh2qqcxqua3zaw7zejys38raf8scfgmmx` | same |

**SatStashPool is NOT deployed yet.** It requires BankToken + PiggyBank addresses as constructor calldata.

Network: OPNet testnet (`networks.opnetTestnet` from `@btc-vision/bitcoin`)
RPC: `https://testnet.opnet.org`
Wallet bech32 prefix: `opt`

---

## 3. Environment Files

### `frontend/.env.testnet` (already filled in)
```
VITE_NETWORK=testnet
VITE_RPC_URL=https://testnet.opnet.org
VITE_PIGGYBANK_ADDRESS=opt1sqrurj6ynh2qqcxqua3zaw7zejys38raf8scfgmmx
VITE_BANK_ADDRESS=opt1sqp0rnuusemhqv3yyaa9y2alp0hryaucdsckqecde
VITE_POOL_ADDRESS=         ← fill after deploying SatStashPool
```

### `contract/.env` (gitignored, contains mnemonic)
```
DEPLOYER_MNEMONIC=...
```

---

## 4. Contract Architecture

### 4a. BankToken (`contract/src/BankToken.ts`)
Plain OP20 token. No constructor calldata. Hardcoded: name="Bank Token", symbol="BANK", decimals=8, max supply=21M. No faucet — users get BANK via the SwapTerminal faucet button which calls `PiggyBank.claimFaucet` for PIGGY and a similar function on BANK if one exists.

> **Note:** BankToken currently has NO faucet method. The SwapTerminal "Inject Test $BANK" button will fail unless a faucet is added. See Pending section.

### 4b. PiggyBank (`contract/src/PiggyBank.ts`)
OP20 vault. Key methods:

| Method | Signature | Notes |
|---|---|---|
| `createVault` | `(mode u256, bps u256, lockBlocks u256)` | mode=1 round-up, mode=2 fixed%; lockBlocks=0 = unlocked |
| `swapForDust` | `(bankAmount u256)` | Burns BANK, mints PIGGY, deposits dust to vault |
| `withdraw` | `()` | Withdraws entire vault balance if lock expired |
| `claimFaucet` | `()` | One-time 100K PIGGY airdrop per address |
| `getPosition` | `(user Address)` → `(balance u256, unlockBlock u256, depositCount u256)` | Read vault state |
| `getDustConfig` | `(user Address)` → `(mode u256, bps u256, lockBlocks u256)` | Read vault config |
| `canWithdraw` | `(user Address)` → `(bool)` | Lock check |
| `getTotalLocked` | `()` → `(u256)` | Protocol TVL |

**Vault existence sentinel:** `mode == 0` means no vault. Since `lockBlocks=0` is now valid (unlocked mode), vault existence is checked via `mode`, not `lockBlocks`.

**Storage layout (pointer order):**
```
OP20 base pointers (0–N)
userDustMode         AddressMemoryMap
userDustBps          AddressMemoryMap
userLockBlocks       AddressMemoryMap
userBalance          AddressMemoryMap
userUnlockBlock      AddressMemoryMap
userDepositCount     AddressMemoryMap
totalLocked          StoredU256
claimed              AddressMemoryMap   ← faucet tracking
```

### 4c. SatStashPool (`contract/src/SatStashPool.ts`)
Constant-product AMM (x×y=k) with 0.3% fee. Extends `OP_NET` (not `Contract`).

| Method | Signature | Notes |
|---|---|---|
| `onDeployment` | calldata: 32B bankAddr + 32B piggyAddr | Stores tokens + owner |
| `initializeLiquidity` | `(bankAmount u256, piggyAmount u256)` | Owner-only, one-time seed |
| `swap` | `(amountIn u256, swapBankToPiggy bool, minAmountOut u256)` → `(amountOut u256)` | CEI pattern |
| `getAmountOut` | `(amountIn u256, swapBankToPiggy bool)` → `(amountOut u256)` | View |
| `getReserves` | `()` → `(bankReserve u256, piggyReserve u256)` | View |

**AMM formula:** `amountOut = (reserveOut × amountIn × 997) / (reserveIn × 1000 + amountIn × 997)`

**Storage layout:**
```
bankToken    StoredAddress
piggyToken   StoredAddress
bankReserve  StoredU256
piggyReserve StoredU256
initialized  StoredU256   (0=false, 1=true)
owner        StoredAddress
```

---

## 5. Build System

### Contract
```bash
cd contract
npm run build        # builds PiggyBank.wasm (entry: src/index.ts)
npm run build:bank   # builds BankToken.wasm (entry: src/index-bank.ts)
npm run build:pool   # builds SatStashPool.wasm (entry: src/index-pool.ts)
npm run build:all    # all three
npm test             # 54 tests (vitest) — all passing
```

WASM outputs → `contract/build/*.wasm`

**Multiple WASM targets:** Each has its own `asconfig-X.json` that sets `use` to the correct abort handler. Target-level `use` override in a single asconfig doesn't work in AS.

### Frontend
```bash
cd frontend
cp .env.testnet .env    # or .env.regtest for local
npm run dev             # localhost:5173
npm run build           # tsc --noEmit && vite build → dist/
```

Tailwind v4 — CSS-first config via `@theme` in `src/index.css`. Plugin: `@tailwindcss/vite`.

---

## 6. Frontend Architecture

### Routing (`src/App.tsx`)
```
No wallet connected     → LandingPage (/)
Wallet + no vault       → redirect to /vault/setup → VaultSetupPage
Wallet + vault exists   → /swap → SwapTerminal  (default)
                          /vault → VaultDashboard
```

Vault existence: `dustConfig.mode > 0n` (mode=0 means no vault configured).

### Pages

| File | Route | Purpose |
|---|---|---|
| `src/pages/LandingPage.tsx` | `/` (no wallet) | Full-screen connect prompt |
| `src/pages/VaultSetupPage.tsx` | `/vault/setup` | Create vault (strategy + lock config) |
| `src/pages/SwapTerminal.tsx` | `/swap` | Faucet buttons + swap BANK→PIGGY with vault routing |
| `src/pages/VaultDashboard.tsx` | `/vault` | Balance, lock progress, withdraw |

### Key Hooks

| File | Exports | Purpose |
|---|---|---|
| `src/hooks/usePiggyBank.ts` | `usePiggyBankContract`, `useBankTokenContract`, `usePoolContract` | Returns typed `getContract()` instances |
| `src/hooks/usePiggyBankData.ts` | `usePiggyBankData` | Polls chain: position, dustConfig, canWithdraw, blocksRemaining, totalLocked |
| `src/hooks/useProvider.ts` | `useProvider` | Returns `JSONRpcProvider` from env RPC URL |

### ABIs (`src/abi/`)

| File | Contract |
|---|---|
| `PiggyBankABI.ts` | createVault, swapForDust, withdraw, claimFaucet, getPosition, getDustConfig, canWithdraw, getTotalLocked |
| `BankTokenABI.ts` | Standard OP20 (transfer, approve, balanceOf, etc.) |
| `SatStashPoolABI.ts` | initializeLiquidity, swap, getAmountOut, getReserves |

**CRITICAL:** ABI method names must exactly match contract method names (including any `_` prefix). OPNet computes selectors from `element.name` directly.

### Config (`src/config/contracts.ts`)
Reads env vars: `VITE_PIGGYBANK_ADDRESS`, `VITE_BANK_ADDRESS`, `VITE_POOL_ADDRESS`.
`getContractAddress(name, network)` returns the address string.

---

## 7. Tests

```
contract/__tests__/PiggyBank.test.ts    — 36 tests
contract/__tests__/SatStashPool.test.ts — 18 tests
Total: 54 tests, all passing
```

PiggyBank tests cover: vault creation (locked/unlocked), swapForDust (dust modes), withdraw (lock enforcement), claimFaucet (one-time gate), canWithdraw logic.

SatStashPool tests cover: liquidity init, constant-product formula, BANK→PIGGY swap, PIGGY→BANK swap, slippage protection, double-init revert.

---

## 8. Deployment Scripts

### `scripts/deploy.ts`
Deploys BankToken then PiggyBank (with 30s propagation delay between).

```bash
cd scripts
npm install
npx tsx deploy.ts testnet              # deploy both
npx tsx deploy.ts testnet --bank-only  # just BankToken
npx tsx deploy.ts testnet --piggy-only # just PiggyBank (needs BANK_TOKEN_ADDRESS env)
```

Uses `TransactionFactory.signDeployment` from `@btc-vision/transaction`.
Provider: `new JSONRpcProvider({ url, network })` — object form required (NOT positional args).

---

## 9. Pending Work

### HIGH PRIORITY

#### 9a. Deploy SatStashPool to testnet
The pool contract is built (`contract/build/SatStashPool.wasm`) but NOT deployed.

Steps:
1. Add deploy entry to `scripts/deploy.ts` for pool contract (calldata = bankAddress + piggyAddress as 32-byte hex each)
2. Run: `npx tsx deploy.ts testnet --pool-only`
   (or add `--pool-only` flag to the script — it doesn't exist yet)
3. Update `frontend/.env.testnet` → `VITE_POOL_ADDRESS=<deployed address>`
4. Seed liquidity via `initializeLiquidity(bankAmount, piggyAmount)` from deployer wallet

#### 9b. BankToken faucet
`SwapTerminal.tsx` has an "Inject Test $BANK" button that calls `claimBankFaucet()` on BankToken. BankToken currently has NO such method. Either:
- Add `claimFaucet()` to `BankToken.ts` (same pattern as PiggyBank, mints e.g. 10K BANK)
- Re-deploy BankToken
- Or remove the BANK faucet button from the frontend

#### 9c. Cyberpunk images
`frontend/public/piggy-cyber.png` does not exist (image generation blocked in agent environment). The `<img>` tags have `onError` fallbacks so the UI doesn't break, but the hero sections are blank.

Generate with:
```
Prompt: "Cyberpunk piggy bank robot, matte dark gunmetal metal body, glowing neon green (#4ade80) circuit traces, visor showing red countdown numbers, Bitcoin orange (f7931a) coin slot on forehead, dark atmospheric background, cinematic 3D render"
Size: 1024×1024
Output: frontend/public/piggy-cyber.png
```

Also wanted: `frontend/public/logo.png` (SatStash text logo, neon green, monospace, black bg).

### MEDIUM PRIORITY

#### 9d. Pool rate display in SwapTerminal
`SwapTerminal.tsx` calls `pool.getAmountOut()` for live rate display. This requires `VITE_POOL_ADDRESS` to be set and pool to be initialized with liquidity. Until then, the rate shows "—" or errors silently.

#### 9e. End-to-end user flow testing
Once pool is deployed and BANK faucet exists:
1. Connect OP_WALLET on testnet
2. Claim BANK faucet → receive 10K $BANK
3. Claim PIGGY faucet → receive 100K $PIGGY
4. Create vault (e.g. Fixed 1%, 1000-block lock)
5. Swap BANK → vault routes dust automatically
6. Wait/check unlock, withdraw

#### 9f. Cloudflare Pages deployment
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name satstash --branch main
```
(Previous project was `eternal-sentinel` — new project name should be `satstash` or similar)

### LOW PRIORITY

#### 9g. Pool-seeding script
Write a script `scripts/seed-pool.ts` that calls `initializeLiquidity` from the deployer wallet to bootstrap initial reserves.

#### 9h. Remove stale components
`src/components/PositionCard.tsx` and `src/components/WithdrawCard.tsx` appear to be leftover from the old design. Verify they are not imported anywhere and delete if unused.

---

## 10. Known Issues / Gotchas

| Issue | Detail |
|---|---|
| `JSONRpcProvider` API | Must use `new JSONRpcProvider({ url, network })` — NOT positional args |
| Vault existence detection | Uses `mode == 0` as sentinel (NOT `lockBlocks == 0`) since unlocked vaults have `lockBlocks=0` |
| `ABIDataTypes` | Is a GLOBAL injected by opnet-transform — do NOT import it in contract code |
| btc-runtime chain ID bug | v1.10.12 missing OPNet testnet chain ID — patched via `patches/@btc-vision+btc-runtime+1.10.12.patch` |
| Network detection | Use `.bech32` prefix string comparison (NOT reference equality) — WalletConnectNetwork extends Network |
| `signer`/`mldsaSigner` | MUST be `null` in frontend `sendTransaction()` — wallet signs itself |
| Tailwind v4 | CSS-first config — extend via `@theme { }` in CSS, NOT tailwind.config.ts |
| Vite cache | Delete `node_modules/.vite` after changing `vite.config.ts` |
| Multiple WASM targets | Need separate `asconfig-X.json` per target — target-level `use` override broken |
| `StoredU256` | `.value` getter/setter; constructor: `new StoredU256(pointer, EMPTY_POINTER)` |
| OP20 reentrancy | OP20 already provides ReentrancyGuard — do NOT add manual locks |

---

## 11. Tech Stack

| Layer | Technology |
|---|---|
| Contracts | AssemblyScript → WASM via `asc`, `@btc-vision/btc-runtime` |
| Contract tests | Vitest + `@btc-vision/unit-tests` |
| Frontend | React 19, React Router v7, Tailwind CSS v4, Vite 7 |
| Wallet | `@btc-vision/walletconnect` (OP_WALLET) |
| Chain interaction | `opnet` npm package (`getContract`, `JSONRpcProvider`) |
| Deployment | `@btc-vision/transaction` (`TransactionFactory.signDeployment`) |
| Network | `@btc-vision/bitcoin` (`networks.opnetTestnet`) |

---

## 12. Key File Index

```
contract/src/
  PiggyBank.ts            Main vault + OP20 token
  BankToken.ts            Simple OP20 (no faucet yet)
  SatStashPool.ts         AMM pool (built, not deployed)
  index.ts                Entry point → PiggyBank WASM
  index-bank.ts           Entry point → BankToken WASM
  index-pool.ts           Entry point → SatStashPool WASM

contract/__tests__/
  PiggyBank.test.ts       36 tests
  SatStashPool.test.ts    18 tests

contract/build/
  PiggyBank.wasm          ← deployed
  BankToken.wasm          ← deployed
  SatStashPool.wasm       ← NOT deployed

frontend/src/
  App.tsx                 Routing logic (landing/setup/swap/vault)
  pages/LandingPage.tsx   No-wallet screen
  pages/VaultSetupPage.tsx  Vault creation UI
  pages/SwapTerminal.tsx  Swap + faucets
  pages/VaultDashboard.tsx  Vault status + withdraw
  components/Header.tsx   Nav + wallet connect/disconnect dropdown
  abi/PiggyBankABI.ts     Method definitions for PiggyBank
  abi/BankTokenABI.ts     OP20 ABI for BankToken
  abi/SatStashPoolABI.ts  Method definitions for SatStashPool
  config/contracts.ts     Address registry (reads VITE_* env vars)
  config/networks.ts      Network/RPC resolution from env
  hooks/usePiggyBank.ts   getContract() wrappers
  hooks/usePiggyBankData.ts  Data polling hook
  hooks/useProvider.ts    JSONRpcProvider factory

frontend/.env.testnet     ← FILLED with deployed addresses
frontend/.env.regtest     ← has empty VITE_POOL_ADDRESS

scripts/deploy.ts         Deploy BankToken + PiggyBank
deployments.json          On-chain deployment record
```
