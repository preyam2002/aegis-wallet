# Aegis — Sui Overflow 2026 Submission Checklist

DeepSurge submission inputs. Fields are filled except the two marked **[EXTERNAL]**, which only the user can provide (video upload + portal account actions).

## Core fields

| Field | Value |
| --- | --- |
| Project name | Aegis Wallet |
| One-line pitch | The Sui wallet that won't let you get drained — a nutrition label and a bouncer for every transaction. |
| Track | DeFi & Payments |
| Category | Wallet / transaction safety |
| Repo | https://github.com/preyam2002/aegis-wallet — **currently PRIVATE; make public or grant judges access before submitting** |
| Demo video | **[EXTERNAL]** — record per `docs/overflow-demo-script.md`, paste URL here |
| Pitch one-pager | `docs/overflow-pitch.md` |
| Team | Solo (preyam2002) |

## What it does (for the submission body)

Aegis is a Sui wallet whose differentiator is the transaction-safety layer Sui lacks: (1) pre-sign `simulateTransaction` rendered as a plain-English *send/receive/objects-leaving* diff, (2) a local risk scanner for unknown recipient / coin-or-object sweep / new-or-unverified package / curated drainer denylist, and (3) address-poisoning protection with a blocking side-by-side comparison. Opt-in **Vault Mode** adds a 2-of-2 native multisig with a Nautilus TEE co-signer that refuses drains and emits on-chain `PolicyPassed`/`PolicyRejected` receipts — *drain-resistant under the AWS-Nitro + reproducible-build trust model, not "provably un-drainable."*

## On-chain evidence (testnet)

| Artifact | ID / digest |
| --- | --- |
| Aegis package (v2: policy/recovery/subaccount/attestation) | `0x204b7722d8ffd03f948f6edbe390c187c8056cb731aadffcd42f9e8ae787131b` |
| Aegis package (first-version, Seal namespace) | `0x599af3fd203d2659af114218d6c61be7ed275715da6d720cb0dc6ce043d1ef6b` |
| Vendored Nautilus enclave package | `0x1c6960afd5f911c3d77c376ef96c58a93a0172e62fc3669be67839b93cc45079` |
| Live Policy object | `0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea` |
| 2-of-2 multisig execution | `8WZkPFPEiU1PpSh8rCozC6Y6y7bm26kPwn5q7Y6ey9k5` |
| On-chain `PolicyRejected` receipt | `G2pDdgmuJfUNGTk27CtgETgrFWnuwviR3pZkPHhJFjcE` |
| On-chain `PolicyPassed` receipt | `CYAb3vHi9W6EB2wQucSRKgqr1Vt65Rkt6vFSAQMRjThU` |
| Native send (simulate→diff proof) | `8TDM767CrrSWpRmH6xFjuFuedCTSDNb8kyvuc48jCs4B` |
| Seal+Shamir recovered-signer vault execution | `9LppkyNfivP4Kz2VKJp7Xsh48p7AF43RknrAypGex1m2` |

## Mainnet

- **Read-only proven:** `pnpm test:integration:swap-quote` — zero-wallet-fee route SUI → USDC.e on mainnet.
- **Publish:** approval-gated behind `AEGIS_ALLOW_MAINNET_SPEND=true` + a funded mainnet key (spends real SUI). See "Mainnet readiness" in `tasklist.md`. Mainnet read-only is the accepted submitted state until approved.

## Test evidence (reproducible)

- Unit: `pnpm test` — shared 23, app 73, extension 8, mobile 7, sponsor 3.
- Move: `MOVE_HOME=/private/tmp/aegis-move-home-test sui move test` — enclave 1, aegis 12.
- Enclave (Rust): `CARGO_HOME=/private/tmp/aegis-cargo cargo test` — 14.
- Live integrations refreshed on 2026-06-09: `simulate`, `activity`, `wallet-snapshot`, `portfolio`, `portfolio-value`, `token-metadata`, `staking-overview`, `testnet`, `swap-quote`, and `policy-receipts`.
- Safety demo backbone: `pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts` — 4 (drainer / sweep / unverified-package / poisoned-address, each with exact user-facing copy).

## Honest-framing guardrails (do not violate in the submission)

- Vault Mode: "drain-resistant under the AWS-Nitro + reproducible-build trust model," never "provably un-drainable." TEE + reproducible build, not ZK.
- No attested co-signing claimed without a real attestation document on-chain; current co-signer evidence is `local-unattested`.
- No live-browser / extension-screenshot claims (shell-render + testnet digests are the evidence floor).
- Cut scope stays cut: no fiat on-ramp, bridge, advanced consumer trading, or ERC-20-style allowance revoker.

## Pre-submit actions for the user **[EXTERNAL]**

1. Record the demo video (`docs/overflow-demo-script.md`) and paste the URL above.
2. Make the repo public (or add judge collaborators).
3. Confirm the two-projects-per-participant rule in the Overflow Discord/handbook if also submitting `predict-studio` to the DeepBook track.
4. Submit on the DeepSurge portal before the **June 21 2026 PT** deadline.
