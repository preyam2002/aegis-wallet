# Aegis Wallet — Handoff / Continue Here

> Single resume anchor for the next session (Claude **or** Codex). Read this first,
> then `tasklist.md` (detailed evidence log) and `docs/superpowers/plans/2026-06-04-aegis-completion.md` (the plan).
> Last updated: 2026-06-21. `main`/`chore/pre-submit-2026-06-15` with local completion/design/Nitro/UI changes not yet committed.

## What Aegis is
A safety-first Sui wallet. Pitch: *"the Sui wallet that won't let you get drained — a nutrition
label and a bouncer for every transaction."* Sui Overflow 2026 entry, **DeFi & Payments** track
(deadline **June 21 2026 PT**). Two pillars: **Safe Wallet** (pre-sign simulation + risk scanner +
address-poisoning, no enclave — the shipping core) and **Vault Mode** (opt-in 2-of-2 multisig with a
Nautilus TEE co-signer — the stretch differentiator).

## Current state (what's DONE)
- **Submission UI + IA redesign — BUILT 2026-06-21.**
  The app visual layer was moved off the gold/obsidian "Armored Luxe" theme (which read as an
  AI-generated "premium" template) to a flat, confident dark system: rewritten `app/src/app/globals.css`
  (no grain/glow/gradient-text/brass — flat panels, hairline borders, one indigo accent + semantic
  green/amber/red, real type scale) and Inter + JetBrains Mono in `layout.tsx`. `WalletDashboard` is now
  two rail tabs — **Wallet** (live portfolio/receive/activity + the safety demo + Send/Stake) and
  **Security** (account/key export + the honest testnet-attested Vault Mode proof) — so no main-screen
  panel reads as a half-built stub. Only the app UI layer + docs changed; chain/enclave/Move/extension
  logic and all on-chain evidence are untouched. Evidence: app tests **84**, whole-repo `pnpm test`
  (shared 28, app 84, extension 6, mobile 7, sponsor 3), `pnpm typecheck`/`lint`/`--filter @aegis/app build`
  and `git diff --check` all clean on 2026-06-21; dev server `curl localhost:3030` → HTTP 200 with the new
  stylesheet served. Shell-only (guardrail #4).
- **First-run trust + visible safety demo — BUILT 2026-06-18.**
  The functional wallet no longer lets a newly created account silently proceed to funding without a
  backup path: created local-key accounts now carry `backupConfirmed: false`, show a required
  `suiprivkey...` backup screen before the dashboard opens, and require typing the last 8 characters
  before marking the backup saved. Imported accounts are treated as already backed up. Unlocked users can
  export the active account secret from Account settings after re-entering the wallet password. The dashboard
  now leads with a read-only **"See it block a drain"** safety demo covering the existing drainer, wallet
  sweep, untrusted-package, and poisoned-address scenarios with no funds at risk. It also surfaces explicit
  "Testnet — no real funds" framing, trusted-recipient/address-book status, and a Vault Mode panel
  labeled with the current `nitro-attested` testnet proof. Evidence: app tests now **83** and workspace
  validation passed on 2026-06-18: `pnpm test` (shared 28, app 83, extension 6, mobile 7, sponsor 3),
  `pnpm typecheck`, `pnpm lint`, `pnpm --filter @aegis/app build`, and `git diff --check`.
- **Real Sui Wallet Standard browser extension — BUILT 2026-06-16 (branch `chore/pre-submit-2026-06-15`).**
  An installable MV3 wallet that real Sui dApps detect + connect to. `extension/src/inpage.ts` registers
  an Aegis wallet via `@mysten/wallet-standard` `registerWallet` in the page MAIN world; `content.ts`
  relays to `background.ts` (service worker) which holds `chrome.storage`-encrypted keys (AES-GCM/PBKDF2,
  session-unlock), simulates every dApp tx via JSON-RPC `dryRunTransactionBlock` (no CORS — `host_permissions`),
  runs the bouncer (`@aegis/shared/dry-run-summary` + `extension/src/risk.ts`), opens a React approval popup
  (`popup.tsx`), and signs/broadcasts. Features: connect / signTransaction / signAndExecuteTransaction /
  signPersonalMessage; **testnet** chain only. Replaced the old dead custom-protocol shell. Bundled with
  esbuild: `pnpm build:extension` → `extension/dist` (load unpacked — see `extension/README.md`). Evidence:
  `pnpm --filter @aegis/extension typecheck`/`lint`/`test` (risk 4 + secret-box 2) + `pnpm build:extension`
  green; latest whole-repo tests green (app 83, shared 28, extension 6, mobile 7, sponsor 3). **In-browser dApp
  detection is verified by loading it** (no browser-automation evidence — guardrail #4, user "no playwright").
- **Functional self-custody wallet — BUILT & PROVEN 2026-06-16 (branch `chore/pre-submit-2026-06-15`).**
  The seeded UI showcase was replaced with a real, usable wallet: local-keypair onboarding (create/import,
  password-encrypted in-browser keystore via WebCrypto), unlock/lock, live portfolio + USD + activity,
  receive with a real QR + testnet faucet, a **Send** flow that builds the PTB → live
  `dryRunTransactionBlock` → runs the risk scanner on the user's *own* tx → blocks critical → signs &
  broadcasts, and native **Stake**. zkLogin is built but env-gated ("configure Enoki to enable" until the
  Enoki/Google keys are set). Built on `@mysten/sui/jsonRpc` (`SuiJsonRpcClient`) so it runs in-browser and
  over JSON-RPC even while the public gRPC simulate quota is throttled. Evidence: `pnpm typecheck` / `lint` /
  `pnpm --filter @aegis/app build` green; app 81 + shared 28 unit tests; **live send digest
  `5ysX3brrhVPazq5PteTgRYC4nMKgwfQMxKoCbNQbFm66`** via `pnpm test:integration:wallet-send` (previewSend rated
  `high`/Unknown-recipient, executeSend `success: true`). Honesty: hot key in browser, testnet-default; no
  browser-automation/screenshot evidence is claimed (guardrail #4 — user reaffirmed "no playwright").
  New code: `app/src/lib/{secret-box,sui-browser-client,send-flow,stake-flow,wallet-account,wallet-policy,address-book,amounts,faucet}`
  + `app/src/components/{Onboarding,UnlockScreen,ReceivePanel,SendModal,StakeModal}` + shared `dry-run-summary`.
  Design spec: `docs/superpowers/specs/2026-06-16-functional-wallet-design.md`. Removed the seeded
  `WalletDashboard` showcase + `demo-data.ts`.
- **Phase 1 (submittable MVP) — COMPLETE, on main.**
  - `app/src/lib/safe-wallet-demo.test.ts` — deterministic "blocks a drainer" demo (drainer / sweep /
    unverified-package / poisoned-address, each asserting exact on-screen copy). App tests now **73**.
  - README rewritten around the safety pitch; `docs/overflow-pitch.md`, `docs/overflow-demo-script.md`,
    `docs/overflow-submission.md` written (every demo beat maps to a real command/digest).
  - Mainnet **read-only proven** (`pnpm test:integration:swap-quote`); publish is approval-gated.
  - Live testnet safety/read paths were re-captured on 2026-06-09: `pnpm test:integration:simulate`
    passed, and activity/portfolio/metadata/staking integrations now share a retrying JSON-RPC helper for
    transient fullnode transport failures.
  - Generated MV3 extension shell no longer fabricates approval signatures; unsigned popup approvals are
    rejected until a real signer supplies a signature.
- **Rolling-daily-cap enforcement — CLOSED 2026-06-11.** The one genuine gap found by the completeness
  audit: `rolling_daily_cap_mist` was stored everywhere but never enforced. The enclave now tracks
  co-sign-approved outflows per vault in a 24h `SpendLedger` (`enclave/src/ledger.rs`) and refuses
  drip-drains with `rolling daily outflow exceeds policy cap` (digest-deduped, refusals don't consume
  the window, cap 0 = disabled). Evidence: 23 cargo tests, stateful `pnpm test:integration:enclave-cosign`,
  live `pnpm test:integration:vault-execute` digest `J42Y7dr1mAPfdzLpTuccVsxgGfUHmHPVKHg9Znrxyhv9`.
- **Phase 2 Vault Mode real attestation — COMPLETE on testnet 2026-06-18.**
  - Reused the proven AWS-Nitro setup from `~/repo/Aletheia/nautilus-oracle`, reduced to Aegis's single
    Sui-fullnode leg: `enclave/run.sh`, `enclave/setup-network-proxy.sh`, `enclave/Dockerfile`
    (now `ENTRYPOINT run.sh` + socat/iproute2 + policy build-args), `enclave/Makefile` (`host-proxy`,
    JSON/text PCR parsing, `run-enclave-debug`), `enclave/DEPLOY.md` (runbook).
  - Deployed a non-debug AWS Nitro Aegis enclave on the Aletheia EC2 box. Live mode is `nitro-attested`,
    public key `533419d87e9b218e61a8128d2b86e3a2248137b92e174adb1895f0892df340d0`, PCR0
    `648aa0d84a78b829e873d5beb9beae5fab932c5806c01dc1dabf6689b12d4b7edaa041b4357ea8e44502220372718351`,
    PCR1 `4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493`,
    PCR2 `c84848bf4657351ee881c9cee596032e2e647abe465bb8309cf92021e81bd5e6be8fc2bd619ce5a450ff42ac208c855b`.
  - Registered on-chain: EnclaveConfig `0xb5f8cc7c85c21485ef75affcec55f093650e320c63e2d5d36000dc80bbd03281`,
    registered enclave `0xfe611cadba91b98fe81aaabfa50459375a256888951dd6e0f05a9db194b14e0e`,
    register digest `HyHbJq2PhnRnRcsbud2eDJhvhvo99GJk3a4T2DdkFnzZ`. The registered `pk` matches the live
    Nitro attestation/API public key.
  - Live Vault proof through the tunneled Nitro enclave passed: benign 2-of-2 digest
    `9pP9YiQ8bYp9NxvqSCdaQTbMUkg3hw7NxY4pm48Psyko`; seeded drain refusal reason
    `recipient is not allowlisted`; fresh on-chain `PolicyRejected` digest
    `8P6fNzmvbhraYYVmgWRzGVXKxozhPkx4eotXvoMRHDQX`.
  - Future-agent runbook with EC2 access, exact verification commands, rebuild steps, and guardrails:
    `docs/local-nitro-vault-agent-guide.md`.
  - **FINDING (do not relitigate):** Aletheia's existing `attestation.json` is a `--debug-mode` build —
    PCR0/1/2 all-zero and the enclave key is bound in `user_data`, not the Nitro `public_key` field.
    It is **NOT** a valid trust anchor for Aegis. Reuse the AWS **box + scripts**, not the doc or
    Aletheia's off-chain-trust Move registry. Aegis keeps its stronger on-chain
    `0x2::nitro_attestation::load_nitro_attestation` + PCR-match path. Decode any doc with
    `python3 scripts/decode-attestation.py <file>` to confirm non-zero PCRs.

## Baselines (latest green as of 2026-06-18) — run these first to confirm no regression
```bash
pnpm test         # shared 28, app 83, extension 6, mobile 7, sponsor 3
pnpm typecheck    # clean
pnpm lint         # clean
pnpm --filter @aegis/app build
MOVE_HOME=/private/tmp/aegis-move-home-test sui move test   # in move/enclave (1) and move/aegis (12)
CARGO_HOME=/private/tmp/aegis-cargo cargo test             # in enclave (23)
```

## What's still external (not code — needs the user / environment)
1. **zkLogin / sponsored gas** → set `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`,
   `ENOKI_PRIVATE_API_KEY`.
2. **Mainnet publish** (prize-half) → `AEGIS_ALLOW_MAINNET_SPEND=true` + funded mainnet key. See "Mainnet
   readiness" in `tasklist.md`.
3. **Optional browser/native-device proof** → no live screenshot/device claim is made unless the user enables
   and runs that proof path.
4. **Submit** → record demo video (`docs/overflow-demo-script.md`), fill the externals in
   `docs/overflow-submission.md`, make repo public / add judges, submit on DeepSurge.
5. **Dual-submission rule** → if also submitting `predict-studio`, confirm with the Overflow portal/Discord
   whether one solo participant can submit two distinct projects.

## File map
- `tasklist.md` — exhaustive per-task evidence log (digests, commands, dates). The source of truth.
- `docs/superpowers/plans/2026-06-04-aegis-completion.md` — the 3-phase plan being executed.
- `docs/specs/aegis-wallet-build-ready-spec.md` — the build-ready spec (§1 non-goals are binding).
- `docs/overflow-{pitch,demo-script,submission}.md` — judge-facing materials.
- `docs/local-nitro-vault-agent-guide.md` — local EC2/Nitro/Vault operational guide for future agents.
- `enclave/DEPLOY.md` — path-A Nitro deploy runbook.
- `app/src/lib/transaction-analysis.ts` + `safe-wallet-demo.test.ts` — the safety core + demo backbone.
- Reference box: `~/repo/Aletheia/nautilus-oracle` (proven Nitro deploy/proxy/register, but DEBUG attestation).

## Guardrails (carry forward — see AGENTS.md)
- Vault Mode is *"drain-resistant under the AWS-Nitro + reproducible-build trust model"* — **never**
  "provably un-drainable." TEE + reproducible build, not ZK.
- Current attested co-signing evidence is **testnet only** with a real non-debug Nitro attestation document
  registered on-chain. Do not claim mainnet or production availability.
- Cut scope stays cut: no fiat on-ramp, bridge, advanced consumer trading, or ERC-20 allowance revoker.
- No browser-automation / live-screenshot claims; shell-render + real testnet digests are the evidence floor.
- Never commit secrets (`.env`, keystores, `*.pem`, private keys). Aletheia's `.env` / `Aletheia.pem` are off-limits.
