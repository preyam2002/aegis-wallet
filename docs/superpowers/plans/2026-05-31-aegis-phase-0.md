# Aegis Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Aegis vertical slice: a polished Safe Wallet transaction-safety screen plus Vault Mode spike scaffolding.

**Architecture:** The app owns deterministic transaction analysis in `app/src/lib`, then renders it in a Next.js web wallet shell. The enclave and Move packages stay narrow: they define request/response and receipt boundaries copied from the Aletheia Nautilus oracle shape, without claiming live attestation until testnet proof exists.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind/CSS, Vitest, Rust axum, Sui Move, `@mysten/sui` v2.

---

### Task 1: Safe Wallet Transaction Analysis

**Files:**
- Create: `app/src/lib/transaction-analysis.ts`
- Create: `app/src/lib/transaction-analysis.test.ts`
- Modify: `app/package.json`

- [ ] Write failing tests for balance diffs, drain risk, package warnings, and address-poisoning detection.
- [ ] Run `pnpm --filter @aegis/app test -- --run` and confirm the tests fail because the module is missing.
- [ ] Implement the smallest deterministic analyzer that passes those tests.
- [ ] Re-run the app tests.

### Task 2: Web Wallet Vertical Slice

**Files:**
- Create: `app/src/app/page.tsx`
- Create: `app/src/app/layout.tsx`
- Create: `app/src/app/globals.css`
- Create: `app/src/components/WalletDashboard.tsx`

- [ ] Render portfolio, transaction preview, risk scanner, address check, and Vault Mode status from deterministic demo data.
- [ ] Keep the UI usable as the first screen; no marketing landing page.
- [ ] Run `pnpm --filter @aegis/app typecheck`.
- [ ] Open the app in the browser and verify the safety screen renders without console errors.

### Task 3: Vault Mode Spike Scaffolding

**Files:**
- Create: `enclave/src/main.rs`
- Create: `enclave/src/policy.rs`
- Create: `enclave/Cargo.toml`
- Create: `move/sources/policy.move`
- Create: `move/Move.toml`
- Create: `README.md`

- [ ] Mirror Aletheia's Nautilus boundary: health, attestation, and process endpoint shape.
- [ ] Implement local policy evaluation for allowed recipient, package allowlist, and max outflow bps.
- [ ] Emit `PolicyPassed` and `PolicyRejected` Move events with explicit trust-model wording in docs.
- [ ] Run `cargo test` for enclave policy logic and `sui move test` if the local Sui CLI can build this package.

### Task 4: Final Validation

**Files:**
- Inspect all changed files.

- [ ] Run `pnpm install`.
- [ ] Run `pnpm --filter @aegis/app test -- --run`.
- [ ] Run `pnpm --filter @aegis/app typecheck`.
- [ ] Run browser smoke on the local app.
- [ ] Report completed work, commands, and remaining live testnet risk.
