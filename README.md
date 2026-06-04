# Aegis Wallet

**Aegis is the Sui wallet that won't let you get drained — a nutrition label and a bouncer for every transaction.**

Sui has no Blockaid, no ScamSniffer, no transaction firewall. A single malicious PTB, signed once, can sweep a wallet. Aegis closes that gap. Every transaction is simulated and explained in plain English *before* you sign, scanned for drain patterns, and checked against your own history for address poisoning. The pitch is safety, not feature count.

**Sui Overflow 2026 track: DeFi & Payments.**

## The three things Aegis does that Slush doesn't

1. **Pre-sign simulation, in plain English.** Before you sign, Aegis runs `client.core.simulateTransaction` and renders exactly what the transaction does — *you send X, you receive Y, these objects leave your wallet* — with any net outflow shown in red. No raw hex, no guessing.
2. **A risk scanner for the patterns that drain wallets.** Deterministic, local heuristics over the simulated effects flag: an unknown recipient, a coin or whole-object sweep, a brand-new or unverified package, a never-interacted package, and hits against a curated drainer denylist. Each finding carries a human reason and a severity the signing screen gates on.
3. **Address-poisoning protection.** A look-alike recipient that shares the first/last characters of a saved contact triggers a blocking side-by-side comparison, and zero-value dust inbound transfers are hidden from activity by default.

These are the surfaces a judge can watch *block a live drain*: feed a denylisted recipient, a wallet sweep, an unverified package, or a poisoned look-alike, and the signing screen refuses to go green. The deterministic backbone of that demo is committed in `app/src/lib/safe-wallet-demo.test.ts`.

## Vault Mode (opt-in stretch)

Vault Mode is a **2-of-2 native multisig** where the second signer is a Nautilus TEE enclave that independently simulates each transaction and only co-signs if it passes published policy. A phished user signature alone is 1-of-2 and the network rejects it; the enclave refuses drains and can emit an on-chain `PolicyPassed` / `PolicyRejected` receipt.

**Honest trust framing:** Vault Mode is *drain-resistant under the AWS-Nitro + reproducible-build trust model* — **not** "provably un-drainable." It is a hardware-TEE plus reproducible-build model, not ZK. Nautilus is an official Mysten template, not an audited product. The repo today runs the co-signer in `local-unattested` mode for development and testnet demos; a **real attested Nitro/Marlin enclave registered on-chain is a stretch goal, not a shipped guarantee.** No attested co-signing is claimed without a real attestation document on-chain.

## Structure

| Path | Purpose |
| --- | --- |
| `app/` | Next.js web wallet shell, deterministic transaction analyzer, and safety UI |
| `extension/` | Browser-extension MV3 manifest and origin-scoped dApp bridge |
| `enclave/` | Rust Nautilus policy co-signer service (`/health_check`, `/get_attestation`, `/co_sign`) |
| `mobile/` | Mobile wallet shell model and Expo-style native app bundle generator |
| `move/` | `aegis` policy/recovery/subaccount/attestation packages and the vendored Nautilus `enclave` module |
| `sponsor/` | Enoki private-key sponsorship control plane for zero-gas onboarding |
| `packages/shared/` | `simulateTransaction` → `SimSummary` mapping and chain adapters shared by app and enclave |

## Commands

```bash
pnpm install --ignore-scripts
pnpm test                              # full workspace unit suite
pnpm typecheck
pnpm lint
pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts   # the "blocks a drainer" demo backbone
pnpm --filter @aegis/app dev
pnpm preflight:external-gates          # diagnostic: lists Nitro/Marlin, Enoki, staking, mainnet, browser gates
pnpm test:integration:simulate         # maps a real testnet PTB into SimSummary
pnpm test:integration:wallet-snapshot  # live testnet portfolio/activity/DeFi snapshot
pnpm test:integration:swap-quote       # mainnet read-only, zero-wallet-fee swap route
pnpm test:integration:localnet-stake   # native staking PTB on a disposable localnet

cd enclave
CARGO_HOME=/private/tmp/aegis-cargo cargo test

cd ../move/aegis
MOVE_HOME=/private/tmp/aegis-move-home sui move test
```

## Trust Model

Vault Mode should be described narrowly: it blocks configured drain classes when the transaction requires both the user signature and a reachable enclave co-signature, and when the enclave PCR / public key is registered and verified on-chain. This is a TEE plus reproducible-build trust model, not ZK and not unconditional un-drainability. The Safe Wallet layer (simulation, risk scanner, address-poisoning) needs no enclave and is the shipping core; Vault Mode is opt-in and depends on the external attestation gate.
