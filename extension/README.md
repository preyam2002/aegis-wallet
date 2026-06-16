# Aegis Wallet — Browser Extension (Sui Wallet Standard)

A real MV3 browser wallet that **real Sui dApps detect and connect to**. It registers
itself through the Sui Wallet Standard (`@mysten/wallet-standard`), so any site built with
`@mysten/dapp-kit` shows **Aegis** in its connect modal — and runs a **simulate + risk
bouncer** on every dApp transaction before you approve.

## Architecture

| File | Runs in | Role |
| --- | --- | --- |
| `src/inpage.ts` | page MAIN world | Registers the Aegis wallet (`registerWallet`); proxies feature calls |
| `src/content.ts` | content (ISOLATED) | Relays page ⇄ background |
| `src/background.ts` | service worker | Keys, JSON-RPC client, simulate + risk, opens approval popup, signs/broadcasts |
| `src/popup.tsx` | popup | Onboarding / unlock / **transaction approval** with the bouncer |
| `src/keyring.ts` | — | `chrome.storage` accounts; secrets encrypted (AES-GCM/PBKDF2), session-unlock |
| `src/risk.ts` | — | dApp-transaction risk on the live `SimSummary` |

Signing happens **only** in the extension (keys never reach the page). RPC runs in the
background with `host_permissions`, so there is no page-origin CORS limit.

## Build & load

```bash
pnpm build:extension          # → extension/dist  (esbuild)
```

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `extension/dist`.
3. Click the **Aegis** toolbar icon → **Create** (set a password) or **Import** a
   `suiprivkey…` key. Importing an already-funded testnet key is the quickest way to test
   transactions; a freshly created account needs testnet SUI first.

## Test against a real Sui dApp (testnet)

1. Open any testnet dApp that uses `@mysten/dapp-kit` (e.g. a Sui sample app / testnet UI).
2. Click **Connect** → pick **Aegis** → approve the connection in the Aegis popup.
3. Trigger a transaction on the dApp → the **Aegis approval popup** opens showing the live
   simulation (you-send / gas / objects leaving) and the risk verdict. **Critical** risk is
   blocked; otherwise **Approve** signs and broadcasts.

## Scope / honesty

- **Testnet only** — the wallet advertises `sui:testnet`. Hot key in browser storage.
- zkLogin / passkey signers are not in the extension yet (local keypair only).
- Verification done here is shell-only: `pnpm --filter @aegis/extension typecheck` /
  `lint` / `test` (risk + keystore) and `pnpm build:extension`. The in-browser dApp
  detection/connection is verified by loading it per above — no browser-automation evidence
  is claimed (project guardrail #4).
