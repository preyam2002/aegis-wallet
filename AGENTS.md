# AGENTS.md — Aegis Wallet

Conventions for any coding agent (Codex, Claude, etc.) working in this repo.
**Start every session by reading [`HANDOFF.md`](./HANDOFF.md), then [`tasklist.md`](./tasklist.md).**

## What this is
A safety-first Sui wallet (pnpm monorepo). Two pillars: **Safe Wallet** (pre-sign simulation, risk
scanner, address-poisoning — no enclave, the shipping core) and **Vault Mode** (opt-in 2-of-2 multisig
with a Nautilus TEE co-signer — the stretch). Sui Overflow 2026, DeFi & Payments track.

## Layout
| Path | What |
| --- | --- |
| `app/` | Next.js 16 + React 19 + TS strict + Biome + Vitest — wallet UI + safety analysis (`app/src/lib/*`) |
| `packages/shared/` | `simulateTransaction` → `SimSummary` mapping + chain adapters (shared by app and enclave logic) |
| `enclave/` | Rust axum Nautilus co-signer (`/health_check`, `/get_attestation`, `/co_sign`, `/policy_check_and_cosign`) + Nitro deploy (`DEPLOY.md`) |
| `move/aegis/` | `policy`, `recovery`, `subaccount`, `attestation` (`PolicyPassed`/`PolicyRejected`) |
| `move/enclave/` | vendored Nautilus `enclave::enclave` module |
| `sponsor/` | Enoki private-key sponsorship control plane |
| `extension/`, `mobile/` | MV3 + Expo shells (generated bundles) |

## Commands (run from repo root)
```bash
pnpm install --ignore-scripts
pnpm test           # shared 20, app 71, extension 8, mobile 7, sponsor 3
pnpm typecheck
pnpm lint
MOVE_HOME=/private/tmp/aegis-move-home-test sui move test    # in move/enclave (1) + move/aegis (12)
CARGO_HOME=/private/tmp/aegis-cargo cargo test               # in enclave (14)
pnpm preflight:external-gates                                # diagnostic: lists what's blocked
```
Integration tests are `pnpm test:integration:<name>` (see `package.json`); many hit live testnet and
can fail with `RESOURCE_EXHAUSTED` when the public RPC is rate-limited — that's environmental, not a regression.

## Code style
- TypeScript strict, functional React components, Tailwind, Biome (not ESLint). Match surrounding code.
- Don't add comments to obvious code; don't add error handling/validation unless asked.
- Always run the relevant test/build after changes. Prefer editing existing files over creating new ones.

## Guardrails (BINDING — these are honesty constraints, not style)
1. **Never overclaim Vault Mode.** It is *"drain-resistant under the AWS-Nitro + reproducible-build trust
   model"* — never "provably un-drainable." TEE + reproducible build, NOT ZK. Nautilus is an official
   template, not an audited product.
2. **No faked attestation.** The enclave currently runs `local-unattested`. Never claim attested
   co-signing without a real **non-debug** Nitro attestation document registered on-chain. (Aletheia's
   `~/repo/Aletheia/attestation.json` is a debug build — all-zero PCRs, key in `user_data` — and is NOT a
   valid anchor. Reuse its box + scripts only.)
3. **Cut scope stays cut** (spec §1 non-goals): no fiat on-ramp, no cross-chain bridge, no advanced
   consumer trading (perps/prediction-markets/tokenized-stocks/chat/cash-card), no ERC-20-style allowance
   revoker (Sui has no standing allowances).
4. **No browser-automation / screenshot claims.** Shell-render + real testnet digests are the evidence floor.
5. **Verify before claiming done.** Run the command; paste the result into `tasklist.md`. Treat every
   `[VERIFY]` in `docs/specs/aegis-wallet-build-ready-spec.md` as a hard checkpoint.
6. **Never commit secrets** (`.env`, keystores, `*.pem`, private keys) even if told "commit everything."

## Where the plan lives
- Live state + next steps: `HANDOFF.md`
- Evidence log: `tasklist.md`
- Plan: `docs/superpowers/plans/2026-06-04-aegis-completion.md`
- Spec (binding non-goals): `docs/specs/aegis-wallet-build-ready-spec.md`
- Judge materials: `docs/overflow-{pitch,demo-script,submission}.md`
