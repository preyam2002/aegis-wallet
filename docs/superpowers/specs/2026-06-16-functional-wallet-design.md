# Functional Wallet — Design Spec (2026-06-16)

Turn the seeded `WalletDashboard` showcase into a **real, self-custody testnet wallet** that
actually holds funds, reads live chain state, and sends with the safety layer running on the
*user's own* transaction. Approved scope: local-keypair accounts (working now) + zkLogin
(built, env-gated), testnet default.

## Principle
Reuse the proven chain logic; build only the missing glue (browser keys + interactive UI +
one dry-run→SimSummary mapper). No faked/seeded data on any live surface.

## Architecture
Browser-direct. Keys live in the browser; chain calls go to the testnet fullnode via
`@mysten/sui`'s JSON-RPC `SuiClient`. Reads reuse `loadLiveWalletSnapshot` (already `fetch`-based).
Fallback only if CORS blocks: a thin `/api/rpc` proxy (keys still never leave the browser).

## Components

### New — `packages/shared`
- `dry-run-summary.ts` — `summarizeDryRun(response, userAddress): SimSummary`. Maps JSON-RPC
  `sui_dryRunTransactionBlock` (balanceChanges/objectChanges/effects.gasUsed/status) to the
  existing `SimSummary`, mirroring `summarizeSimulation`. **TDD, exported from `index.ts`.**

### New — `app/src/lib`
- `sui-browser-client.ts` — `createBrowserSuiClient(network)` → JSON-RPC `SuiClient`.
- `keystore.ts` — `encryptSecret(secretB64, password)` / `decryptSecret(blob, password)` using
  WebCrypto (PBKDF2 → AES-GCM). Persist/load ciphertext in `localStorage`. **TDD.**
- `send-flow.ts` — `previewSend({client, sender, intent, policy, addressBook, totalMist})` builds
  the PTB, dry-runs, maps to `SimSummary`, returns `analyzeSimSummary(...)`. `executeSend(...)`
  signs+executes via the keypair. Client injectable for tests. **TDD the preview path.**
- `faucet.ts` — `requestTestnetFaucet(address)` → POST testnet faucet.
- `wallet-account.tsx` — React context: account list, active address, locked/unlocked, in-memory
  keypair after unlock, create/import/lock/unlock/export, persistence via `keystore`.

### New — `app/src/components`
- `Onboarding.tsx` — create / import / zkLogin (gated: "Connect Enoki to enable").
- `UnlockScreen.tsx` — password unlock for an existing encrypted account.
- `SendModal.tsx` — recipient+amount → live preview (diff + findings) → confirm gate (blocked on
  `critical`) → sign+execute → digest + refresh.
- `ReceivePanel.tsx` — real address, QR (`createReceiveQrSvg`), copy, testnet faucet button.

### Rewired
- `WalletDashboard.tsx` — consume `useWalletAccount()` + a live snapshot (loaded via
  `loadLiveWalletSnapshot`) instead of `lib/demo-data`. Keep the existing visual design/CSS.
- `page.tsx` — wrap in `WalletAccountProvider`; gate render on onboarding/unlock state.

## Live vs panel (honest, v1)
Live & interactive: onboard/unlock, portfolio+USD, activity, **send w/ live sim+risk**, receive+QR+faucet, stake.
Kept as status panels (not faked): Vault Mode, guardian recovery, dApp connect, swap execution, sub-accounts.

## Testing
Vitest for `dry-run-summary`, `keystore`, `send-flow` preview. Existing integration scripts + the
green sweep remain the chain-evidence floor. No Playwright/screenshot claims (per guardrails);
the UI is verified manually in the browser.

## Honesty guardrails (unchanged)
Hot key in browser storage → testnet default + explicit warning. zkLogin shows "configure Enoki"
until keys present — never faked. Vault/attestation untouched. Cut scope stays cut.

## Build order
1. shared `dry-run-summary` (+tests, export)
2. app lib: `sui-browser-client`, `keystore` (+tests), `send-flow` (+tests), `faucet`
3. `wallet-account` context
4. components: Onboarding, UnlockScreen, ReceivePanel, SendModal
5. rewire `WalletDashboard` + `page.tsx`
6. verify: typecheck, lint, test, app build, manual browser pass
