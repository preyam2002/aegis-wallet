# Aegis — Sui Overflow 2026 Pitch

**One-liner:** Aegis is the Sui wallet that won't let you get drained — a nutrition label and a bouncer for every transaction.

**Track:** DeFi & Payments.

## The problem

Ethereum users are protected by an entire industry of transaction firewalls — Blockaid, Wallet Guard, ScamSniffer, Pocket Universe — wired into MetaMask, Phantom, and Rabby. **Sui has none of this.** The dominant failure mode on Sui is not a standing token allowance (Sui has no ERC-20 allowances); it is a **single malicious PTB** that the user signs once and that sweeps their coins and objects in one shot. Today a Sui user signing a transaction sees an opaque payload and a "Approve" button. There is no pre-sign firewall, no plain-English diff, no drainer denylist, no address-poisoning guard at the wallet layer.

## The solution — three safety pillars (no enclave required)

1. **Pre-sign simulation in plain English.** Aegis runs `client.core.simulateTransaction` (`@mysten/sui` v2 gRPC) on the built PTB and maps it to a `SimSummary`: *you send X, you receive Y, these objects leave your wallet, gas is Z.* Any net outflow renders red. Failed simulations decode to human copy, not raw `MoveAbort` hex.
   - Code: `packages/shared/src/sim-summary.ts`, `app/src/lib/transaction-analysis.ts`, `app/src/lib/error-copy.ts`.
2. **A risk scanner for drain patterns.** Deterministic local heuristics over the simulated effects flag: unknown recipient, coin/whole-object sweep, brand-new or unverified package, never-interacted package, and curated drainer-denylist hits. Each finding has a severity (`low/medium/high/critical`); the signing screen aggregates to the worst and gates on it.
   - Code: `app/src/lib/transaction-analysis.ts`; demo backbone: `app/src/lib/safe-wallet-demo.test.ts`.
3. **Address-poisoning protection.** A recipient that look-alike-matches a saved contact (shared prefix/suffix, different middle) triggers a blocking side-by-side comparison; zero-value dust inbound is hidden from activity by default.
   - Code: `detectAddressPoisoning` / `filterVisibleActivity` in `app/src/lib/transaction-analysis.ts`.

Around those pillars is a real daily-driver shell: live testnet portfolio/activity/NFT/DeFi snapshot, USD valuation from live coin metadata, send/receive with QR, a zero-wallet-fee swap route (mainnet read-only proven), native staking, a connected-dApp/permissions manager, network + security settings with mainnet spend guardrails, passkey signing, and a command menu.

## Why now / why Sui

- Sui's PTB model makes the *single-signed-transaction* drain the primary attack, which is exactly what per-transaction simulation defends — the defense fits the threat model natively.
- Sui ships first-class primitives the safety story needs: `client.core.simulateTransaction` for the pre-sign diff, native multisig with passkey members, `0x2::nitro_attestation` for on-chain TEE attestation, and Seal for guardian recovery. Aegis is built on these, not around them.
- The wallet lane is crowded next to Slush (the official wallet). Aegis does not compete on feature count — it competes on **safety**, the one axis Slush and the rest leave open.

## Demo (every beat maps to a real command or testnet digest)

1. Open the wallet — live testnet portfolio + activity (`pnpm test:integration:wallet-snapshot`).
2. Simulate a normal send — plain-English diff (`pnpm test:integration:simulate`).
3. Attempt a drainer PTB — scanner blocks with the reason (`safe-wallet-demo.test.ts` → "Known drainer recipient").
4. Attempt a poisoned-address send — blocking side-by-side (`safe-wallet-demo.test.ts` → "Address looks like a saved contact").
5. *(Stretch)* Vault Mode refuses a drain → on-chain `PolicyRejected` receipt.

Full run-of-show: `docs/overflow-demo-script.md`.

## The stretch differentiator — Vault Mode

A 2-of-2 native multisig whose second signer is a Nautilus TEE enclave that re-simulates each transaction and only co-signs if it passes published policy. A phished user signature alone is 1-of-2 and cannot land; the enclave refuses drains and emits an on-chain `PolicyPassed`/`PolicyRejected` receipt.

**Honest framing:** *drain-resistant under the AWS-Nitro + reproducible-build trust model* — not "provably un-drainable." TEE + reproducible build, not ZK. Nautilus is an official template, not an audited product. The local-unattested co-signer works on testnet today (`pnpm test:integration:vault-execute`); a **real attested enclave registered on-chain is a stretch goal gated on external Nitro/Marlin provisioning**, and no attested co-signing is claimed without a real attestation document on-chain.

## Status

- **Safe Wallet:** demo-ready. Full unit suite green (shared 20, app 71, extension 8, mobile 7, sponsor 3), real testnet digests, passkey tx executed on testnet, Move tests green (`enclave` 1, `aegis` 12), enclave Rust tests green (14).
- **Mainnet:** read-only proven (swap route via Bluefin/Cetus). `move/aegis` mainnet publish is approval-gated behind `AEGIS_ALLOW_MAINNET_SPEND=true` (the prize-half criterion).
- **Vault Mode attestation:** stretch, gated on the external AWS-Nitro/Marlin enclave gate.
