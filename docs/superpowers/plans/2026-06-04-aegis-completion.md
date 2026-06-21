# Aegis Overflow Completion Plan — 2026-06-04

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT mark a task done without running its exact verification command and pasting the result into `tasklist.md`. Treat every `[VERIFY]` in `docs/specs/aegis-wallet-build-ready-spec.md` as a hard checkpoint.

## 1. Objective

Take Aegis from a feature-complete prototype to a **submittable Sui Overflow 2026 entry**.

- **One-line safety pitch (use verbatim, never overclaim):** *"Aegis is the Sui wallet that won't let you get drained — a nutrition label and a bouncer for every transaction."*
- **Chosen track: DeFi & Payments.** Hero is the **Safe Wallet** (the done, no-TEE half): pre-sign plain-English transaction simulation, a risk scanner (unknown recipient / coin or object sweep / new-or-unverified package / curated drainer denylist), and address-poisoning protection.
- **Honest trust framing for Vault Mode:** "drain-resistant under the AWS-Nitro + reproducible-build trust model" — NOT "provably un-drainable." TEE + reproducible build, not ZK. Nautilus is an official template, not an audited product.
- **MVP vs stretch:** Phase 1 (Safe Wallet, ships) is the submission floor. Phase 2 (Vault Mode real attestation) is a stretch differentiator. Phase 3 is the demo video + DeepSurge submission. The entry is valid and submittable at the end of Phase 1 alone.
- **Deadline: June 21 2026 PT** (~17 days from 2026-06-04). ~50% of judging is real-world application; half the prize unlocks on **mainnet deploy**.

**2026-06-18 status update:** Phase 2's Path A landed on testnet. A non-debug AWS Nitro Aegis enclave is registered on-chain with EnclaveConfig `0xb5f8cc7c85c21485ef75affcec55f093650e320c63e2d5d36000dc80bbd03281` and registered enclave `0xfe611cadba91b98fe81aaabfa50459375a256888951dd6e0f05a9db194b14e0e`; attested benign Vault tx `9pP9YiQ8bYp9NxvqSCdaQTbMUkg3hw7NxY4pm48Psyko`; fresh `PolicyRejected` `8P6fNzmvbhraYYVmgWRzGVXKxozhPkx4eotXvoMRHDQX`. This is testnet evidence only, not a mainnet/production availability claim.

### Architecture (unchanged, do not re-litigate)
- `app/` Next.js 16 + React 19 + TypeScript strict + Biome + Vitest — wallet UI and deterministic safety analysis (`app/src/lib/*`).
- `packages/shared/` — the `simulateTransaction` → `SimSummary` mapping and chain adapters, shared by app and enclave logic.
- `enclave/` — Rust axum Nautilus co-signer (`/health_check`, `/get_attestation`, `/co_sign`, `/policy_check_and_cosign`).
- `move/aegis/` — `policy`, `recovery`, `subaccount`, `attestation` (`PolicyPassed`/`PolicyRejected` receipts). `move/enclave/` — vendored Nautilus `enclave::enclave`.
- `sponsor/` — Enoki private-key sponsorship control plane.
- Stack: pnpm workspaces, Biome, Vitest, `@mysten/sui@2.17.0` (v2 gRPC), `@mysten/seal@1.1.3`, Move `2024.beta`, Rust axum enclave.

## 2. Verify-first checkpoints (run before building anything)

Establish a green baseline so any later regression is attributable. Run from repo root.

- [ ] **V1 — Full unit/typecheck baseline is green.** Run: `pnpm test && pnpm typecheck && pnpm lint`. AC: `pnpm test` reports the known passing counts (shared 28, app 83, extension 6, mobile 7, sponsor 3); typecheck and lint exit 0. Record exact counts.
- [ ] **V2 — Move tests green.** Run: `MOVE_HOME=/private/tmp/aegis-move-home-test sui move test` in `move/enclave` and `move/aegis`. AC: enclave 1 test, aegis 12 tests pass.
- [ ] **V3 — Enclave Rust tests green.** Run: `CARGO_HOME=/private/tmp/aegis-cargo cargo test` in `enclave`. AC: 23 tests pass, including the Nitro `public_key`-binding test.
- [ ] **V4 — Live Safe-Wallet read paths still resolve testnet.** Run: `pnpm test:integration:simulate`, `pnpm test:integration:activity`, `pnpm test:integration:wallet-snapshot`. AC: each exits 0 against live testnet (simulate maps a real PTB to `SimSummary`; snapshot returns portfolio/activity/DeFi rows). If the public faucet or RPC is rate-limited, record the exact error and proceed (read paths are not the blocker).
- [ ] **V5 — External-gate preflight reflects current blockers.** Run: `pnpm preflight:external-gates`. AC: exits 0 as a diagnostic, verifies Nitro attestation artifacts plus registered testnet enclave key, and lists the current Enoki/OAuth, staking-balance, and mainnet-spend gates; browser/device proof is optional unless explicitly re-enabled. This is the source of truth for §4.

## 3. Phased atomic tasks

### Phase 1 — MVP: lock the Safe Wallet submission (ships)

Goal: a judge can watch Aegis **block a drainer and a poisoned-address transaction live**, read a safety-first README, and see the entry is mainnet-aware. This phase alone is a valid DeFi & Payments submission.

- [ ] **T1.1 — Deterministic "drainer blocked" demo scenario.** Add a committed, reproducible demo fixture + script that feeds a known drain PTB and a curated-denylist hit through `app/src/lib/transaction-analysis.ts` and asserts the scanner returns `level:'block'` with the human reason, and feeds a look-alike recipient through `detectAddressPoisoning` and asserts a blocking side-by-side result. Reuse existing modules; do NOT add new heuristics. Put the scenario in `app/src/lib/` as a test (e.g. `safe-wallet-demo.test.ts`) so it runs in CI.
  - AC: a single test file proves block-on-drainer, block-on-sweep, block-on-unverified-package, and block-on-poisoned-address, each with the exact user-facing copy.
  - Verify: `pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts` exits 0.
- [ ] **T1.2 — Live testnet "drain refused" capture for the demo.** Using the existing testnet harness, capture a real testnet digest where the Safe Wallet simulation shows a net-outflow / object-leaving diff (the thing a drainer would do) so the demo can show real on-chain data, not mocks. Reuse `pnpm test:integration:simulate` / `pnpm test:integration:send`; do not write a new executor.
  - AC: a recorded real testnet digest + the rendered `SimSummary` (sends/objectsLeaving/risk) is appended to `tasklist.md` as demo evidence.
  - Verify: `pnpm test:integration:simulate` exits 0 and the digest resolves on a testnet explorer.
- [ ] **T1.3 — README + pitch rewrite around SAFETY.** Rewrite `README.md` to lead with the one-line pitch (§1), position against Slush on safety (not feature count), state the DeFi & Payments track, and keep the honest Vault Mode trust framing. Keep the existing `## Commands` and `## Trust Model` sections accurate. Do NOT claim live browser proof or faked attestation.
  - AC: README's first screen is the safety pitch + the three Safe-Wallet pillars; no overclaim; Vault Mode described as opt-in stretch under the Nitro + reproducible-build model.
  - Verify: `grep -i "won't let you get drained" README.md` matches, and `pnpm lint` still passes (README is in the Biome check set per `tasklist.md`).
- [ ] **T1.4 — Pitch one-pager for judges.** Create `docs/overflow-pitch.md`: problem (Sui has no Blockaid/ScamSniffer; drains via a single malicious PTB), solution (the three pillars), why-now/why-Sui, track (DeFi & Payments), demo script outline, and the honest Vault Mode stretch line. ~1 page, concrete.
  - AC: file exists, references real features/files, no invented capabilities.
  - Verify: `test -f docs/overflow-pitch.md`.
- [ ] **T1.5 — Confirm mainnet-deployable surfaces for the prize half.** Enumerate exactly which Move/app surfaces can deploy to mainnet for the "half the prize on mainnet deploy" criterion WITHOUT spending unapproved funds: `move/aegis` package publish (needs approval/funding — external), mainnet read-only flows (swap-quote already proven), and app pointing at a mainnet fullnode read-only. Document the publish command and the explicit approval gate; do NOT publish without `AEGIS_ALLOW_MAINNET_SPEND=true`.
  - AC: a short "Mainnet readiness" subsection in `tasklist.md` lists deployable surfaces, the exact publish command, and that mainnet read-only is acceptable as the submitted state until approval.
  - Verify: `pnpm test:integration:swap-quote` exits 0 (proves mainnet read-only works) and `pnpm preflight:external-gates` shows the `mainnet-deploy-and-swap-execution` gate state.
- [ ] **T1.6 — Phase 1 regression gate.** Re-run V1 + V2 from §2 after all Phase 1 edits.
  - AC: no regression vs baseline counts.
  - Verify: `pnpm test && pnpm typecheck && pnpm lint`, then `MOVE_HOME=/private/tmp/aegis-move-home-test sui move test` in both Move packages.

### Phase 2 — Stretch: Vault Mode real attestation

Goal: replace local-unattested evidence with a REAL attested Nitro/Marlin enclave, registered on-chain, proving an attested 2-of-2 multisig that refuses a seeded drain and emits an on-chain `PolicyRejected`. This closes acceptance tests `Spike: reproducible-build PCRs match on-chain EnclaveConfig` and `Spike: drain PTB returns enclave refusal and PolicyRejected on Explorer`.

- [x] **T2.0 — A-vs-B attestation decision GATE.** Decide and record in `tasklist.md`:
  - **(A) Replicate Aletheia AWS Nitro** — vanilla Nautilus ed25519 + own `EnclaveConfig`; matches current `enclave/`, `move/aegis::attestation`, `move/enclave`, and `scripts/register-nautilus-enclave.ts` with NO Move/multisig rework. User points Codex at the Aletheia repo/scripts/instance.
  - **(B) Marlin Oyster** — managed/Docker, no AWS, but secp256k1 + PCR16 + its own registry ⇒ Move + multisig rework (`MultiSigPublicKey` member key type, attestation parsing, registry calls).
  - **Default lean = (A)** to preserve the existing ed25519/Nautilus path. Do not provision any enclave until this gate is closed.
  - AC: decision + rationale appended to `tasklist.md`; if (B), a sub-task list for the Move/multisig rework is added before any provisioning.
  - Verify: `grep -i "attestation decision" tasklist.md` matches the recorded decision.
- [x] **T2.1 — Reproducible enclave build artifacts.** With the path from T2.0, produce the enclave image and PCRs using the existing `enclave/Makefile` + `enclave/Dockerfile` (production `make run`, NOT `make run-debug` which yields all-zero PCRs). This requires the external toolchain (§4); Codex prepares the commands and the `enclave/out/pcr-values.json` shape the register script expects.
  - AC: `enclave/out/pcr-values.json` (or `AEGIS_PCR0/1/2`) is populated with real 48-byte SHA-384 PCRs from a non-debug build; `make -n build-enclave` is clean.
  - Verify (local, pre-hardware): `CARGO_HOME=/private/tmp/aegis-cargo cargo test` in `enclave` stays green; `make -n build-enclave` exits 0. Real PCRs are an external gate (§4).
- [x] **T2.2 — Register PCR/pubkey on-chain.** Run the existing registration flow against the real attestation document: `pnpm register:enclave` (`scripts/register-nautilus-enclave.ts`) with `AEGIS_PCR0/1/2` (or `AEGIS_PCRS_JSON`) and `AEGIS_ATTESTATION_BASE64`/`AEGIS_ATTESTATION_PATH`, calling `0x2::nitro_attestation::load_nitro_attestation` then `enclave::register_enclave<AEGIS>`.
  - AC: a real `EnclaveConfig<AEGIS>` + `Enclave<AEGIS>` exist on testnet with on-chain `pk` == the enclave's `/get_attestation` `public_key`; digests recorded in `tasklist.md`.
  - Verify: `pnpm register:enclave` exits 0 and prints the `register_enclave` digest; the `Enclave` object's `pk` matches the attested public key.
- [x] **T2.3 — Attested 2-of-2 benign execution.** Point the existing vault executor at the REAL attested enclave (not the local-unattested one): the enclave's `/get_attestation` must report `mode:"nitro-attested"`. Execute a benign 2-of-2 passkey+enclave multisig tx on testnet via the established path.
  - AC: a real testnet digest from a 2-of-2 vault where the enclave signature came from an attested enclave (`mode:"nitro-attested"`), recorded in `tasklist.md`; this is the first non-local evidence for the "benign PTB → valid 2-of-2" acceptance test.
  - Verify: `pnpm test:integration:vault-execute` exits 0 with the attested enclave reachable; `pnpm test:integration:enclave-cosign` confirms `/get_attestation` mode and matching pubkey.
- [x] **T2.4 — Attested drain refusal + on-chain `PolicyRejected`.** Seed a drain PTB (non-allowlisted recipient / over-cap outflow); the attested enclave refuses via `/co_sign` (server-side dry-run + on-chain `Policy`), the under-signed tx cannot land, and an on-chain `PolicyRejected` receipt is emitted and surfaced in the UI.
  - AC: a real testnet `PolicyRejected` digest visible on an explorer, produced by the attested enclave's refusal, recorded in `tasklist.md`; closes `Spike: drain PTB → enclave refusal + PolicyRejected on Explorer`.
  - Verify: `pnpm test:integration:vault-execute` shows the refusal path and `pnpm test:integration:policy-receipts` resolves the live `PolicyRejected` digest.
- [ ] **T2.5 — Phase 2 regression + receipts in UI.** Confirm the Vault panel surfaces the real `PolicyPassed`/`PolicyRejected` receipts and nothing regressed.
  - AC: `app/src/lib/policy-receipts.ts` + `WalletDashboard` render the real digests; baseline tests still green.
  - Verify: `pnpm --filter @aegis/app test src/lib/policy-receipts.test.ts` and `pnpm test` exit 0.

### Phase 3 — Demo video + DeepSurge submission (DeFi & Payments primary)

- [ ] **T3.1 — Demo script + recording (external recording, Codex writes the script).** Author the demo run-of-show in `docs/overflow-pitch.md` (or a sibling `docs/overflow-demo-script.md`): (1) open wallet, (2) simulate a normal send — plain-English diff, (3) attempt a drainer PTB — scanner blocks with reason, (4) attempt a poisoned-address send — blocking side-by-side, (5) [stretch] Vault Mode refuses a drain → on-chain `PolicyRejected`. Map each beat to a real command/digest from Phases 1–2.
  - AC: every demo beat references a real, reproducible command or testnet digest; no faked steps.
  - Verify: `test -f docs/overflow-demo-script.md` (or the section exists in the pitch doc); each referenced command is listed in `package.json` scripts.
- [ ] **T3.2 — Submission package assembly.** Assemble the DeepSurge submission inputs: project name, one-line pitch, track (DeFi & Payments), repo link, mainnet/testnet deploy addresses + digests, demo video link (external), and the honest Vault Mode framing. Codex prepares a `docs/overflow-submission.md` checklist with every field filled except the externally-supplied ones (video URL, portal account).
  - AC: `docs/overflow-submission.md` lists all submission fields; only video URL and portal-account actions are marked as external.
  - Verify: `test -f docs/overflow-submission.md`.
- [ ] **T3.3 — Final green gate before submission.** Re-run the full baseline (§2 V1–V3) plus the live Safe-Wallet read paths (V4) and record the final evidence block in `tasklist.md`.
  - AC: full suite green; demo digests resolve.
  - Verify: `pnpm test && pnpm typecheck && pnpm lint`; `MOVE_HOME=/private/tmp/aegis-move-home-test sui move test` (both packages); `CARGO_HOME=/private/tmp/aegis-cargo cargo test` (enclave).

## 4. External gates — Codex CANNOT do these alone

These require human action, real credentials, or hardware Codex has no access to. Surface them early; `pnpm preflight:external-gates` tracks most.

- [x] **AWS Nitro provisioning (Phase 2 testnet).** Path A was selected and executed on the Aletheia AWS Nitro box on 2026-06-18. Real PCRs, a real non-debug attestation document, on-chain registration, attested benign 2-of-2 execution, and a fresh `PolicyRejected` receipt are recorded in `tasklist.md`. Mainnet/prod availability remains separate and unclaimed.
- [ ] **Enoki / OAuth keys (zkLogin + sponsored gas).** `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `ENOKI_PRIVATE_API_KEY` are unset. Live zkLogin stable-address and zero-SUI sponsored-tx acceptance tests stay blocked without them. (Not required for the Phase 1 MVP submission.)
- [ ] **Mainnet deploy approval + funding.** Publishing `move/aegis` to mainnet (the prize-half criterion) spends real SUI and is gated behind `AEGIS_ALLOW_MAINNET_SPEND=true` plus a funded mainnet key. Until approved, the submitted state is mainnet read-only (acceptable).
- [ ] **Public testnet faucet funding.** Native-staking execution and some live writes need >1 SUI; the public faucet is rate-limited. Localnet is the fallback already in place (`pnpm test:integration:localnet-stake`).
- [ ] **Demo video recording + DeepSurge submission.** Codex writes the script and assembles the field checklist but cannot record screen/voice or operate the portal account. User records and submits.
- [ ] **Two-project-per-participant rule (BLOCKING for strategy, not code).** Confirm in the Overflow Discord/handbook whether a solo participant may submit Aegis AND `predict-studio` to two tracks. One project = one track is confirmed; two projects per person is UNVERIFIED. If disallowed, the user prioritizes — this does not change Aegis's code.
- [ ] **X/social or any OAuth app keys** if the demo or onboarding flow needs them — none required for the Phase 1 MVP.

## 5. Risks & gotchas

- **Crowded wallet lane.** Aegis sits next to Slush (the official Sui wallet). The ENTIRE pitch must be SAFETY, not feature parity — never market Aegis on feature count. Lead every surface with "won't let you get drained."
- **Do NOT overclaim Vault Mode.** The 2026-06-18 testnet proof is real non-debug Nitro evidence, but still only testnet under the AWS-Nitro + reproducible-build trust model. Never claim mainnet/prod availability or "provably un-drainable."
- **Do NOT re-introduce cut scope.** Spec §1 non-goals: no fiat on-ramp, no cross-chain bridge, no advanced consumer trading (perps/prediction markets/tokenized stocks/chat/cash card), no ERC-20-style allowance revoker (Sui has no standing allowances). These were removed on 2026-06-03; re-adding them for the demo is a regression.
- **`make run-debug` yields all-zero PCRs.** Phase 2 must use the production `make run` build path or registration is meaningless.
- **No browser-automation overclaim.** The current evidence boundary is shell-rendered dashboard proof plus real testnet/mainnet command output; do not claim live browser/extension screenshots unless the user explicitly re-enables that proof path.
- **Overclaim language.** Vault Mode is "drain-resistant under the AWS-Nitro + reproducible-build trust model," never "provably un-drainable."
- **`[VERIFY]` markers in the spec still bind** — especially `@mysten/sui` `client.core.executeTransaction` field names, Seal classic vs gRPC surface, and `load_nitro_attestation` network feature-flag/gas. Do not invent APIs around them.

## 6. Definition of Done

**MVP line (submittable — required):**
- Safe Wallet "block a drainer / poisoned-address" demo is reproducible from committed tests (T1.1) and backed by a real testnet digest (T1.2).
- README + judge pitch lead with the safety positioning and the DeFi & Payments track (T1.3, T1.4), with honest Vault Mode framing.
- Mainnet-deployable surfaces are documented and the mainnet read-only path is proven (T1.5); mainnet publish is approval-gated.
- Baseline green: `pnpm test && pnpm typecheck && pnpm lint`, `sui move test` (both packages), `cargo test` (enclave) (T1.6 / T3.3).
- Demo script + submission field checklist assembled (T3.1, T3.2); only video URL + portal action remain external.

**Stretch line (differentiator — not required to submit):**
- A-vs-B attestation path decided (T2.0).
- A REAL attested enclave (`mode:"nitro-attested"`) registered on-chain with PCR↔pubkey match (T2.1, T2.2).
- Attested 2-of-2 benign execution + attested drain refusal with a live on-chain `PolicyRejected` digest (T2.3, T2.4), closing the two open enclave acceptance tests.

**Out of scope (do not do):** fiat on-ramp, bridge, advanced trading, allowance revoker, browser-automation screenshots, faked attestation, building a second wallet to chase Agentic Web.

**Timeline (~17 days):** Phase 1 ≈ days 1–5 (mostly assembly of done work). Phase 2 ≈ days 6–14, fully dependent on the external Nitro/Marlin gate landing — start the T2.0 decision and the user's provisioning ask on day 1. Phase 3 ≈ days 14–17. If Phase 2's external gate slips, submit the Phase 1 MVP on time and present Vault Mode as the documented stretch.
