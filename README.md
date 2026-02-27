# SatStash — Bitcoin Savings Vault on OPNet

SatStash is a Bitcoin L1 DeFi application built on [OPNet](https://opnet.org) that lets users swap tokens and automatically route "dust" into a time-locked savings vault — all in a single transaction.

## How It Works

1. **Create a Vault** — Choose a dust mode (round-up or fixed %) and a lock period
2. **Swap Tokens** — Trade BANK and PIGGY tokens through an on-chain AMM or the atomic swap
3. **Auto-Stash** — A portion of each swap is automatically routed into your locked vault
4. **Withdraw** — Once the lock period expires, claim your accumulated savings

### Dust Modes

| Mode | Description |
|------|-------------|
| **Round-Up** | Rounds the swap output to the nearest whole token; the fractional remainder goes to your vault |
| **Fixed %** | A configurable percentage (0.01%–10%) of each swap is routed to your vault |

### Atomic Swap + Vault

SatStash performs the swap and vault deposit in a **single transaction** — no waiting for block confirmations between steps.

- **BANK → PIGGY**: Calls `swapForDust` on PiggyBank. BANK is deposited into the contract, PIGGY is minted to your wallet minus dust, dust goes to vault.
- **PIGGY → BANK**: Calls `swapPiggyForBank` on PiggyBank. PIGGY dust is routed to your vault, the remainder is converted to BANK from contract reserves.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  BankToken   │     │  PiggyBank   │     │ SatStashPool  │
│   (BANK)     │◄───►│ (PIGGY+Vault)│◄───►│  (AMM Pool)   │
│   OP20       │     │   OP20       │     │  BANK/PIGGY   │
└─────────────┘     └──────────────┘     └───────────────┘
       │                    │                     │
       └────────────────────┼─────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  React Frontend│
                    │  (Vite + TS)  │
                    └───────────────┘
```

### Smart Contracts

| Contract | Description |
|----------|-------------|
| **BankToken** | OP20 token with faucet. 500M max supply, 8 decimals. |
| **PiggyBank** | OP20 token (PIGGY) + time-locked dust vault. Handles atomic swaps via `swapForDust` and `swapPiggyForBank`. |
| **SatStashPool** | Constant-product AMM (x*y=k) for BANK/PIGGY with 0.3% swap fee. |

### Key Contract Methods

**PiggyBank:**
- `createVault(mode, bps, lockBlocks)` — Configure vault dust mode and lock period
- `swapForDust(bankAmount, minPiggyOut)` — Atomic BANK→PIGGY swap with dust routing
- `swapPiggyForBank(piggyAmount, minBankOut)` — Atomic PIGGY→BANK swap with dust routing
- `depositToVault(amount)` — Manual PIGGY deposit into vault
- `withdraw()` — Claim vault balance after lock expires
- `getPosition(addr)` — View vault balance, unlock block, deposit count
- `getDustConfig(addr)` — View dust mode, bps, lock blocks

**SatStashPool:**
- `swap(amountIn, bankToPiggy, minAmountOut)` — Standard AMM swap
- `getAmountOut(amountIn, bankToPiggy)` — Quote swap output
- `getReserves()` — View pool reserves

## Project Structure

```
SatStash/
├── contract/              # OPNet smart contracts (AssemblyScript → WASM)
│   ├── src/
│   │   ├── BankToken.ts       # BANK OP20 token
│   │   ├── PiggyBank.ts       # PIGGY token + vault + atomic swaps
│   │   └── SatStashPool.ts    # AMM liquidity pool
│   └── __tests__/             # Contract tests
├── frontend/              # React + Vite frontend
│   └── src/
│       ├── pages/
│       │   ├── LandingPage.tsx      # Home page
│       │   ├── SwapTerminal.tsx     # Swap interface
│       │   ├── VaultSetupPage.tsx   # Vault configuration
│       │   └── VaultDashboard.tsx   # Vault status & withdrawal
│       ├── hooks/                   # React hooks for contract interaction
│       ├── abi/                     # Contract ABI definitions
│       └── components/              # Shared UI components
├── scripts/               # Deployment & seeding scripts
│   ├── deploy.ts                # Deploy contracts to testnet
│   ├── init-pool-only.ts        # Initialize pool liquidity
│   ├── seed-pool.ts             # Seed pool with tokens
│   └── seed-piggybank-reserves.ts  # Seed BANK reserves for reverse swaps
└── deployments.json       # Deployment history
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- An OPNet-compatible wallet (e.g. [OP_WALLET](https://opwallet.org))

### Build Contracts

```bash
cd contract
npm install
npm run build
```

### Deploy to Testnet

```bash
# Set deployer mnemonic in contract/.env
echo 'DEPLOYER_MNEMONIC=your twelve word mnemonic phrase here' > contract/.env

cd scripts
npm install

# Deploy all three contracts
npx tsx deploy.ts testnet

# Initialize pool liquidity
npx tsx init-pool-only.ts

# Seed PiggyBank with BANK reserves (for PIGGY→BANK swaps)
npx tsx seed-piggybank-reserves.ts
```

### Run Frontend

```bash
cd frontend
npm install

# Update .env.testnet with your deployed contract addresses
npm run dev
```

The frontend runs on `http://localhost:4000`.

## Testnet Deployment

Currently deployed on OPNet testnet (Signet fork):

| Contract | Address |
|----------|---------|
| BankToken | `opt1sqrvknudxl4vtwkfyc3nhl8mcfrtngztp8cm8l4n5` |
| PiggyBank | `opt1sqrgk6v53fcu9pv795usf8qavrd3x43ec6vxp09ek` |
| SatStashPool | `opt1sqz67am5aywdx39uza7u6sevruf32t23k9vdhls62` |

**RPC**: `https://testnet.opnet.org`

## Tech Stack

- **Contracts**: AssemblyScript compiled to WASM, deployed via OPNet's Tapscript-encoded calldata
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Blockchain**: OPNet Bitcoin L1 (OP20 token standard)
- **Wallet**: OP_WALLET browser extension
- **Libraries**: `@btc-vision/bitcoin`, `@btc-vision/transaction`, `opnet`

## License

MIT
