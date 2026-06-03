# Aegis Wallet — Build-Ready Implementation Spec

> Self-contained spec for a coding agent (Codex) to implement end-to-end. Every API below was
> extracted from primary sources (Sui framework Move, `MystenLabs/nautilus`, `MystenLabs/ts-sdks`,
> `MystenLabs/seal`, Enoki docs) in June 2026. Symbols marked **[VERIFY]** could not be 100%
> confirmed from a primary source — the implementer MUST check them against the cited typedoc/source
> before relying on them, and must NOT invent APIs around them. Pin exact package versions on day 1.

---

## 1. What this builds

A secure, beautiful Sui wallet (web app first; browser extension + mobile later). Two pillars:

- **Pillar 1 — Safe Wallet (core, ships first, NO enclave dependency):** a gorgeous, fast daily-driver wallet whose differentiator is the **transaction-safety layer Sui lacks today** — pre-sign simulation ("you send X / receive Y / these objects leave," red on outflow), risk scanning, a connected-dApp/permissions manager, and address-poisoning protection. Plus zkLogin/Enoki onboarding (zero seed, zero gas).
- **Pillar 2 — Vault Mode (flagship moat, opt-in):** a **2-of-2 native multisig** account where signer #1 is the user's passkey and signer #2 is a **Nautilus TEE enclave** that independently simulates each transaction and only produces its signature if the transaction passes published, audited policy. The enclave's signing key is registered on-chain via Nautilus attestation, so a phished user signature alone cannot move funds, and anyone can verify the co-signer runs the measured code.

**Honest framing (use verbatim, never overclaim):** "drain-resistant under the AWS-Nitro + reproducible-build trust model" — NOT "provably un-drainable." The trust model is hardware-TEE + reproducible build, not ZK. Nautilus is an official *starting template*, not an audited product.

### Non-goals (v1 — do NOT build)
- Browser extension / mobile app (web only for v1).
- An EVM-style "token approval/allowance manager." **Sui has no standing ERC-20 allowances** — the drain vector is a malicious PTB in a single signed tx, defended by per-tx simulation (Pillar 1). The "permissions" surface is a **connected-dApp/session manager** + a list of capability objects the wallet itself handed out, not an allowance revoker.
- Custom DEX/bridge — integrate an existing aggregator for swap; do not build routing.
- On-chain m-of-n *enforcement* of guardian count (it's enforced client-side at Shamir combine — see §9).

---

## 2. Blocking pre-work (resolve before scheduling, not before coding)
Sui Overflow 2026 target date is June 21, 2026 per the user's confirmed portal/handbook read. **This is still being built as a real product, not as a throwaway sprint.** If the Overflow submission path remains open, enter it; do not let the deadline justify faking the Phase 0 Vault Mode gate.

---

## 3. Repo layout (create `/Users/preyam/repo/aegis-wallet`)

```
aegis-wallet/                 # pnpm workspace monorepo
  app/                        # Next.js 16 (App Router) + React 19 + Tailwind + Biome — the wallet UI
    src/
      lib/sui/                # client, account model, signing flows
      lib/safety/             # simulation parsing, risk scanner, address-poisoning, permissions
      lib/onboarding/         # zkLogin/Enoki
      lib/vault/              # enclave client, multisig assembly
      lib/recovery/           # Seal + Shamir guardian recovery
      components/             # signing screen, portfolio, send, activity, etc.
  enclave/                    # Rust Nautilus enclave (Vault Mode co-signer) — fork nautilus template
  move/
    enclave/                  # COPY of nautilus `move/enclave` (published by us)
    aegis/                    # our Move package: policy receipts, recovery config
  packages/shared/            # shared TS types (the app<->enclave<->chain contracts in §7)
  sponsor/                    # optional backend for Enoki private-key sponsorship (§8)
```

Toolchain: pnpm workspaces, Biome (lint/format), Vitest (TS tests), `sui move test` (Move), Turbopack dev. Edition for Move: `2024.beta`.

---

## 4. Tech stack & pinned imports (the package map — get this right first)

`@mysten/sui` is **v2, ESM-only**. Key subpath exports (confirmed from `ts-sdks`):
- `@mysten/sui/grpc` → **`SuiGrpcClient`** (canonical client; use this)
- `@mysten/sui/jsonRpc` → `SuiJsonRpcClient` (the old `SuiClient`, now deprecated)
- `@mysten/sui/transactions` → `Transaction`
- `@mysten/sui/keypairs/ed25519|secp256r1|passkey` → `Ed25519Keypair`, `Secp256r1Keypair`, `PasskeyKeypair`, `BrowserPasskeyProvider`
- `@mysten/sui/multisig` → `MultiSigPublicKey`, `MultiSigSigner`
- `@mysten/sui/bcs`, `/utils` (`fromHEX`,`toHEX`), `/zklogin`
- `@mysten/seal` → `SealClient`, `SessionKey`, `getAllowlistedKeyServers`
- `@mysten/enoki` → `EnokiFlow`, `EnokiClient`, `registerEnokiWallets`, `useEnokiFlow`
- `@mysten/dapp-kit` for wallet-standard dApp connection.

Client setup:
```ts
import { SuiGrpcClient } from '@mysten/sui/grpc';
const client = new SuiGrpcClient({ baseUrl: 'https://fullnode.testnet.sui.io:443', network: 'testnet' });
// Core API lives at client.core.* (simulateTransaction, executeTransaction, signAndExecuteTransaction)
```
**[VERIFY]** Pin one exact `@mysten/sui` version — `client.core` surface is early-GA and moving. **[VERIFY]** `@mysten/seal` "classic `SealClient`" vs newer `$extend(seal())` gRPC surface — pin the classic surface (paired with a `SuiClient`/jsonRpc client) unless the installed version only ships the gRPC extension.

---

## 5. Pillar 1 — Safe Wallet (no enclave)

### 5.1 Pre-sign simulation (the headline everyday feature)
Method: **`client.core.simulateTransaction(options)`** (replaces `devInspectTransactionBlock`/`dryRunTransactionBlock`; `devInspect` ≡ `checksEnabled:false`).
```ts
const result = await client.core.simulateTransaction({
  transaction: tx,                               // Transaction | Uint8Array (pre-build via await tx.build({client}) to be safe)
  include: { balanceChanges: true, effects: true, objectTypes: true },
});
const txn = result.Transaction ?? result.FailedTransaction;   // $kind-tagged union
if (!txn.status.success) renderError(txn.status.error);
```
Response shape (confirmed from `ts-sdks/packages/sui/src/client/types.ts`):
- `txn.balanceChanges: { coinType: string; address: string; amount: string }[]` — `amount` is a **signed** string; **negative = leaves your wallet**. Drive the "you send / you receive" rows from this, filtered to the user's address.
- `txn.effects.changedObjects: ChangedObject[]` — there is **NO top-level `objectChanges`** in v2; "objects leaving" = entries where `inputOwner` == user and `outputOwner` != user, or `idOperation:'Deleted'` / `outputState:'DoesNotExist'`.
- `txn.objectTypes: Record<objectId,string>` — map ids to type strings for display.
- `txn.effects.gasUsed: GasCostSummary` (string fields) for the fee line.

UI rule: render a human-readable diff; if any non-gas coin/object leaves, show it in **red** with the recipient; if simulation fails, show the decoded error (great error copy, not raw hex).

### 5.2 Risk scanner (define heuristics — Sui has no Blockaid/ScamSniffer equivalent)
Deterministic, local heuristics over the parsed PTB + simulation:
- **Unknown recipient:** any coin/object transfer to an address not in the user's address book / never-before-sent. Warn.
- **Whole-object / coin-sweep:** transfer that empties a coin balance or moves an owned object the user didn't explicitly pick. Warn loudly.
- **Brand-new / unverified package:** for each `moveCall` target package, fetch the package's publish info; flag if first-seen-recently or not in a curated allowlist of known-good packages (maintain a small JSON allowlist of major Sui protocols). Warn.
- **Never-interacted package:** user has no prior tx with this package. Inform.
- **Curated drainer denylist:** a JSON list (start empty; structure it so it can be updated). Block-warn on match.
Each heuristic returns `{level: 'info'|'warn'|'block', reason}`; the signing screen aggregates to the worst level.

### 5.3 Address-poisoning protection
On send: compare the entered/pasted recipient against the user's history; if it **look-alike-matches** (same first/last N chars, different middle) a previously-used address, show a **blocking side-by-side comparison** (Trust Wallet pattern). Also hide zero-value/dust inbound transfers from the activity feed by default.

### 5.4 Permissions / connected-dApp manager (the Sui-correct "approval manager")
List active dApp connections/sessions (via dapp-kit) with one-click disconnect; list capability objects the wallet has handed to dApps (if the app issued any) with revoke = delete the object. **Do not** build an ERC-20 allowance revoker.

### 5.5 Daily-driver shell
Portfolio (tokens + USD + NFT gallery + DeFi positions), human-readable activity feed, send/receive **with QR scan** (Slush lacks it), in-wallet swap via an existing aggregator (no added fee), staking, dApp connect (wallet-standard), per-site account isolation, ⌘K command menu, watch-only mode, notifications. Product opinion (hold it): *clarity + recovery + opinion over completeness* — explain, don't dump raw protocol state.

---

## 6. Pillar 2 — Vault Mode (Nautilus co-signer)

### 6.1 Account model
Vault account = **Sui native 2-of-2 multisig**, `threshold:2`, members `[{passkey pubkey, weight:1}, {enclave ed25519 pubkey, weight:1}]`. Passkey CAN be a multisig member (confirmed — dedicated SDK doc section). The enclave key is **ed25519** (confirmed from the nautilus Rust server). The enclave's pubkey is anchored on-chain by Nautilus attestation (§6.3) so the co-signer is auditable.

Build/derive/sign/combine (confirmed `@mysten/sui/multisig`):
```ts
const ms = MultiSigPublicKey.fromPublicKeys({ threshold: 2, publicKeys: [
  { publicKey: passkeyPublicKey, weight: 1 },
  { publicKey: enclaveEd25519PublicKey, weight: 1 },
]});
const vaultAddress = ms.toSuiAddress();
// per tx:
const bytes = await tx.build({ client });
const userSig = (await passkey.signTransaction(bytes)).signature;
const enclaveSig = await enclaveCoSign(bytes, userSig);          // §6.2; enclave returns its partial sig or refuses
const combined = ms.combinePartialSignatures([userSig, enclaveSig]);
await client.core.executeTransaction({ transaction: bytes, signatures: [combined] });  // [VERIFY] exact field names
```
**Enforcement model (be precise, don't overclaim):** a phished user signature alone yields only 1-of-2 → the network rejects the under-signed tx. The enclave is the second required signature and refuses to sign drains. The on-chain attestation registry (§6.3) is the *trust anchor* proving the enclave pubkey only ever signs via the audited policy code; it is not consulted at signature-verification time. Optionally the app/enclave also emits an on-chain `PolicyRejected` receipt (§6.4) for auditability/demo.

### 6.2 Enclave service (Rust; fork `MystenLabs/nautilus` `src/nautilus-server`)
Runs in AWS Nitro (via **Marlin Oyster** to avoid self-managing Nitro). Generates `eph_kp = Ed25519KeyPair` in-enclave only. Endpoints (extend the template):
- `GET /get_attestation` → Nitro attestation doc (hex) with the ed25519 pubkey embedded in its `public_key` field (used for on-chain registration). [confirmed]
- `POST /co_sign` → **our new endpoint.** Request: `{ txBytes: base64, userSig: string, vaultAddress: string }`. The enclave: (a) decodes the PTB, (b) runs `simulateTransaction` against a fullnode, (c) evaluates policy (§6.5), (d) if pass → returns `{ ok: true, enclaveSig }` (ed25519 over the tx bytes per the multisig contract); if fail → returns `{ ok: false, reason }` and optionally a signed rejection for an on-chain receipt.
- `GET /health_check`.
Signing of app outputs follows the template's `IntentMessage{intent:u8, timestamp_ms:u64, data:T}` BCS layout (field order `intent || timestamp_ms(LE) || payload`) — **must byte-match** the Move side; the template ships `test_serde` cross-language tests, mirror them.
**[VERIFY resolved 2026-06-03]** native-multisig partial signatures are produced by `signTransaction(txBytes)`: the tx bytes are the API input, and the actual Ed25519 message is `blake2b256(messageWithIntent('TransactionData', txBytes))`. Do **not** sign the Nautilus `IntentMessage` wrapper for native multisig; that wrapper is for the separate on-chain `enclave::verify_signature` pattern (§6.4). Native multisig is primary for v1.

### 6.3 On-chain attestation (Nautilus) — two Move layers
1. **Native framework module `0x2::nitro_attestation`** (no dependency needed; in Sui framework). Parses+verifies the Nitro doc:
   `entry fun load_nitro_attestation(attestation: vector<u8>, clock: &Clock): NitroAttestationDocument` (clock = shared `@0x6`). Accessors: `pcrs()`, `public_key(): &Option<vector<u8>>`, etc. Errors `ENotSupportedError=0` (feature flag off), `EParseError=1`, `EVerifyError=2`, `EInvalidPCRsError=3`.
2. **Template module `enclave::enclave`** — COPY `move/enclave` from the nautilus repo into `move/enclave` and publish it yourself (it is **NOT** a published package; example IDs are per-deployment). `Move.toml`: `enclave = { local = "../enclave" }`. Public surface:
   - `new_cap<T: drop>(otw, ctx) -> Cap<T>`
   - `create_enclave_config<T>(cap, name, pcr0, pcr1, pcr2, ctx)` (shares `EnclaveConfig<T>`)
   - `update_pcrs<T>(config, cap, pcr0, pcr1, pcr2)` (bumps version; for code upgrades)
   - `register_enclave<T>(config, document, ctx)` — asserts live PCRs == config PCRs, stores `document.public_key()` as `Enclave<T>.pk`, shares `Enclave<T>`
   - `verify_signature<T,P: drop>(enclave, intent_scope, timestamp_ms, payload, sig): bool` (ed25519)
   Objects: `EnclaveConfig<T>{pcrs, version, capability_id}` (shared), `Enclave<T>{pk, config_version, owner}` (shared), `Cap<T>` (owned). `Pcrs(vector<u8>,vector<u8>,vector<u8>)` = PCR0 image / PCR1 kernel / PCR2 app, each 48-byte SHA-384.
   Registration is done off-chain via a PTB (mirror `register_enclave.sh`): call `0x2::nitro_attestation::load_nitro_attestation` then `enclave::register_enclave<OTW>`.
Reproducible build: `make ENCLAVE_APP=<app>` → `out/nitro.eif` + `out/nitro.pcrs`; **production must use `make run` (NOT `make run-debug`, which yields all-zero invalid PCRs).** Mainnet-live since June 2025 (protocol v83). **[VERIFY]** target-network feature flag (`load_nitro_attestation` not returning `ENotSupportedError`), gas cost (dry-run on testnet — cert-chain verify is heavy), and Marlin Oyster's Move interface (its demo repo source was not read).

### 6.4 (Alternative, OUT OF SCOPE v1) Move-verified smart-account
Instead of native multisig, route every vault tx through a Move entry that calls `enclave::verify_signature` over the tx payload before executing. Stronger "Move decides on-chain" story but more complex. Document as a future option; **build §6.1 native multisig for v1.**

### 6.5 Policy (rule-based, evaluated inside the enclave)
Stored in an on-chain user-owned `aegis::policy::Policy` object (mirrors enclave config) AND read by the enclave: package allowlist, per-tx cap, rolling-daily cap, deny transfer to non-allowlisted recipient, deny net-outflow > threshold (from simulation). The enclave fetches the user's `Policy` + simulates, then signs/refuses. **Liveness wart (spec it):** if the enclave/Marlin is down the user can't transact in Vault Mode → Vault Mode is opt-in and must have the §9 recovery/escape path (e.g. timelocked owner-rotation to a non-vault multisig).

### 6.6 `aegis` Move package
- `aegis::policy` — `Policy` object (fields above), setters (owner-gated), `PolicyPassed`/`PolicyRejected` events + receipt-emit entry (for demo/audit).
- (`aegis::recovery` in §9.)

---

## 7. App ↔ enclave ↔ chain contracts (shared TS types, `packages/shared`)
```ts
type CoSignRequest  = { txBytes: string /*base64*/; userSig: string; vaultAddress: string };
type CoSignResponse = { ok: true; enclaveSig: string } | { ok: false; reason: string; rejectionReceipt?: string };
type SimSummary = {
  sends: { coinType: string; amount: string; to?: string }[];   // amount negative
  receives: { coinType: string; amount: string }[];
  objectsLeaving: { objectId: string; type?: string; to?: string }[];
  gas: string;
  risk: { level: 'info'|'warn'|'block'; reason: string }[];
  failed?: { error: string };
};
```
The same `simulateTransaction`→`SimSummary` mapping is used client-side (instant preview) and server-side in the enclave (authoritative policy input) — factor it into `packages/shared` so both call identical logic.

---

## 8. Onboarding — zkLogin + Enoki
Browser login (confirmed method names): `new EnokiFlow({ apiKey })` → `createAuthorizationURL({ provider, clientId, redirectUrl, network })` → redirect → `handleAuthCallback()` → `getKeypair({ network })` → `.toSuiAddress()`. React: `registerEnokiWallets({ apiKey, providers })` + `useEnokiFlow()`.
Sponsored gas, easy path: `enokiFlow.sponsorAndExecuteTransaction({ network, transaction, client })`. Backend control plane (`sponsor/`): `new EnokiClient({ apiKey: private })` → `createSponsoredTransaction({ network, sender, transactionKindBytes, allowedAddresses?, allowedMoveCallTargets? })` → user signs returned bytes → `executeSponsoredTransaction({ digest, signature })`. Public key client-side, **private key backend only**. **[VERIFY]** exact param keys (`transaction` vs `transactionBlock`), `createSponsoredTransaction` return shape (`{bytes,digest}`), store names, and the `signPersonalMessage` extra-byte issue (sui#17912) before feeding Enoki-signed messages into Seal session keys.
**zkLogin recovery constraints (hard requirements):** OAuth-account loss = permanent lockout; salt is required to re-derive the address (Enoki manages it — treat as a recovery dependency). Therefore the account's recoverable control MUST live in a multisig with a guardian-recovered key (§9), NOT in "recovering the zkLogin key" (zkLogin has no static private key).

---

## 9. Recovery — Seal + Shamir (Pillar 3; after 1 & 2)
**Load-bearing distinction:** **Seal does NOT split secrets** (its threshold is t-of-n over *key servers*). **We do Shamir m-of-n ourselves, client-side, then Seal-encrypt each share** to a per-guardian identity under a Move policy. Two independent numbers: Shamir m-of-n (ours) vs Seal key-server t (theirs).
- Seal client (classic surface): `new SealClient({ suiClient, serverConfigs, verifyKeyServers })`; `getAllowlistedKeyServers(network)` for the default set. Encrypt: `client.encrypt({ threshold, packageId: fromHEX(pkg), id: fromHEX(id), data }) → { encryptedObject, key }` (`key` = symmetric backup key, **[VERIFY]** offline-decrypt usability). Decrypt: `SessionKey.create({ address, packageId, ttlMin, suiClient })` → sign personal message → `client.decrypt({ data, sessionKey, txBytes })` where `txBytes` is a PTB calling only `seal_approve*`.
- Move `seal_approve(id: vector<u8>, ...policyRefs)` — **side-effect-free, only abort/return**; key servers dry-run it; first param is identity bytes (pkg prefix stripped); namespace the id by an on-chain config object id. Concrete `wallet::recovery` sketch (allowlist + timelock + `request_recovery`) is in §9 of the source notes; `m`-of-n is **advisory on-chain, enforced client-side at `shamirCombine`** (document this in the threat model).
- Account shape: a Sui multisig whose signers are { zkLogin(Google), zkLogin(backup provider), guardian-recovered key }, so OAuth loss still leaves the guardian path. **[VERIFY]** live mainnet Seal key-server objectIds + whether the committee/aggregator shipped + which servers are permissioned (re-pull Seal Pricing before mainnet).

---

## 10. Ordered task list (each independently verifiable)

**Phase 0 — scaffold + enclave feasibility spike (parallel).**
- T0.1 Scaffold pnpm monorepo (§3), Next.js app shell, Biome, Vitest, `SuiGrpcClient` wired to testnet.
- T0.2 Passkey: register + sign a testnet tx with `PasskeyKeypair` (Pillar-1 signer).
- T0.3 **Spike A:** publish `move/enclave`; stand up the nautilus Rust enclave on Marlin Oyster; register it on-chain (PCR↔ed25519 pubkey) and confirm `register_enclave` succeeds.
- T0.4 **Spike B:** build a 2-of-2 multisig (passkey + enclave key), have the enclave `/co_sign` a benign testnet tx, combine + execute. **Then** seed a drain PTB → enclave refuses → tx can't complete → emit `PolicyRejected`.
- **Gate:** if T0.3/T0.4 don't land, Vault Mode is deferred; Pillar 1 ships regardless.

**Phase 1 — ship Safe Wallet:** T1.x simulation→`SimSummary` mapping (§5.1, shared lib) + signing screen UI; risk scanner heuristics (§5.2); address-poisoning (§5.3); permissions/dApp manager (§5.4); portfolio/send+QR/activity/swap/staking shell (§5.5); zkLogin+Enoki onboarding (§8); design pass (anti-Slush). Deploy `aegis` Move bits to mainnet.

**Phase 2 — productionize Vault Mode:** policy object + editor UI (§6.5/6.6), opt-in flow, on-chain receipts surfaced in UI, liveness/escape path.

**Phase 3 — recovery & reach:** Seal+Shamir guardian recovery (§9); capability sub-accounts; then extension + mobile.

---

## 11. Acceptance tests
- **Spike:** multisig tx lands on testnet; reproducible-build PCRs match on-chain `EnclaveConfig`; drain PTB → enclave signed refusal + `PolicyRejected` on Explorer; benign PTB → valid 2-of-2 execution.
- **Safe Wallet:** simulation renders correct signed balance diffs + objects-leaving on real PTBs; risk scanner flags an unverified package and a coin-sweep; address-poisoning blocks a look-alike send; dApp manager disconnects a session.
- **Onboarding:** zkLogin login yields a stable address; a sponsored tx executes with the user holding zero SUI.
- **Move:** `sui move test` green for `aegis` + the copied `enclave`; testnet→mainnet deploy; receipts visible on Explorer.
- **UX evidence:** side-by-side screen recording vs Slush on 5 tasks (open, send w/ QR, connect dApp, sign, recover).

## 12. Consolidated [VERIFY] list (check before relying — do not invent)
1. Pin exact `@mysten/sui` version; confirm `client.core.executeTransaction`/`signAndExecuteTransaction` field names. 2. `@mysten/seal` classic `SealClient` vs `$extend(seal())` — pin one. 3. Native-multisig co-sign uses `signTransaction(txBytes)`, which signs the Sui `TransactionData` intent digest; the Nautilus `IntentMessage` wrapper is not used for native multisig. 4. Sui `load_nitro_attestation` enabled on target network + gas cost (dry-run). 5. Marlin Oyster Move interface. 6. Seal `key` offline-decrypt usability. 7. Live mainnet Seal key servers / committee / permissioning. 8. Enoki `EnokiFlow`/`EnokiClient` exact param keys + return shapes + sui#17912 byte issue. 9. `BrowserPasswordProviderOptions` spelling vs typedoc. 10. `findCommonPublicKey` export status in the pinned SDK. 11. m-of-n is client-side at Shamir combine, not in `seal_approve` (threat-model note).

## 13. Source URLs (truth set for the implementer)
- Nautilus: `github.com/MystenLabs/nautilus` (`move/enclave/sources/enclave.move`, `move/seal-policy/`, `src/nautilus-server/src/{main,common}.rs`, `register_enclave.sh`, `Makefile`, `UsingNautilus.md`); `docs.sui.io/sui-stack/nautilus`; `0x2::nitro_attestation` in `MystenLabs/sui` framework; `blog.sui.io/nautilus-tamper-proof-oracles`; Marlin: `blog.marlin.org/scaling-confidential-compute-on-sui-nautilus-and-marlin-oyster-integration`.
- Sui SDK v2: `sdk.mystenlabs.com/sui/migrations/sui-2.0/json-rpc-migration`, `sdk.mystenlabs.com/typescript/cryptography/{multisig,passkey}`, response types in `ts-sdks/packages/sui/src/client/types.ts`; passkeys `docs.sui.io/concepts/cryptography/passkeys` + SIP-9.
- Seal: `sdk.mystenlabs.com/seal`, `github.com/MystenLabs/seal` (`Design.mdx`, `UsingSeal.mdx`, `move/patterns/sources/{tle,whitelist}.move`), `seal-docs.wal.app/{UsingSeal,Pricing}`.
- Enoki/zkLogin: `docs.enoki.mystenlabs.com` (+ `/ts-sdk/sponsored-transactions`), `docs.sui.io/concepts/cryptography/zklogin`, issue `MystenLabs/sui#17912`.

---

## Appendix A — Verbatim reference snippets (Seal · Enoki · Recovery)

> Copy-paste reference for §8–§9. All snippets reproduced from primary sources; `[VERIFY]` markers carry the same force as §12.

### A.1 Seal client (classic surface) — construct / encrypt / decrypt
```ts
import { SealClient, SessionKey, getAllowlistedKeyServers } from '@mysten/seal';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { fromHEX } from '@mysten/sui/utils';
import { Transaction } from '@mysten/sui/transactions';

const suiClient = new SuiClient({ url: getFullnodeUrl('testnet') });
const client = new SealClient({
  suiClient,
  serverConfigs: [{ objectId: '0x…keyserver', weight: 1 /*, apiKeyName?, apiKey?, aggregatorUrl? */ }],
  verifyKeyServers: true, // prod
});

// encrypt — threshold is t-of-n over KEY SERVERS, NOT a Shamir split of data
const { encryptedObject, key: backupKey } = await client.encrypt({
  threshold: 2, packageId: fromHEX(packageId), id: fromHEX(id), data, // data: Uint8Array
}); // backupKey = symmetric DEM backup key — [VERIFY] offline-decrypt usability

// decrypt
const sessionKey = await SessionKey.create({ address, packageId: fromHEX(packageId), ttlMin: 10, suiClient });
const { signature } = await keypair.signPersonalMessage(sessionKey.getPersonalMessage());
sessionKey.setPersonalMessageSignature(signature);
const tx = new Transaction();
tx.moveCall({ target: `${packageId}::recovery::seal_approve`, arguments: [ tx.pure.vector('u8', fromHEX(id)), /* +policy objs, clock @0x6 */ ] });
const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true });
const decrypted = await client.decrypt({ data: encryptedObject, sessionKey, txBytes });
```
Key-server set: `getAllowlistedKeyServers(network)` for the Mysten default set. Testnet committee/aggregator objectId `0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98` (3-of-5). Onchain Seal package ids — testnet `0x4016869413374eaa71df2a043d1660ed7bc927ab7962831f8b07efbc7efdb2c3`, mainnet `0xcb83a248bda5f7a0a431e6bf9e96d184e604130ec5218696e3f1211113b447b7`. **[VERIFY] mainnet key-server objectIds/committee/permissioning — re-pull `seal-docs.wal.app/Pricing` before mainnet.**

### A.2 `seal_approve` Move patterns (verbatim from `seal/move/patterns`)
```move
// tle.move — time-lock. key format: [pkg id][bcs::to_bytes(u64 unlock_ms)]
module patterns::tle;
use sui::{bcs::{Self, BCS}, clock};
const ENoAccess: u64 = 77;
fun check_policy(id: vector<u8>, c: &clock::Clock): bool {
    let mut p: BCS = bcs::new(id); let t = p.peel_u64();
    (p.into_remainder_bytes().length() == 0) && (c.timestamp_ms() >= t)
}
entry fun seal_approve(id: vector<u8>, c: &clock::Clock) { assert!(check_policy(id, c), ENoAccess); }
```
```move
// whitelist.move (core) — id must be prefixed by the policy object id; reads ctx.sender()
entry fun seal_approve(id: vector<u8>, wl: &Whitelist, ctx: &TxContext) {
    assert!(check_policy(ctx.sender(), id, wl), ENoAccess); // prefix(id)==wl.id && wl.addresses.contains(sender)
}
```
Contract: `seal_approve*` is **side-effect-free (only abort/return)**; key servers dry-run the PTB and permit **only `seal_approve*` calls**; first param is identity bytes with the pkg prefix already stripped; caller = `sessionKey.address`.

### A.3 `aegis::recovery` Move sketch (Shamir m-of-n + timelock)
```move
module aegis::recovery;
use sui::{clock, table};
const ENoAccess: u64 = 1;
public struct RecoveryConfig has key {
    id: UID, owner: address, m: u64 /*advisory on-chain*/, timelock_ms: u64,
    guardians: table::Table<address, bool>, recovery_requested_at: u64, // 0 = inactive
}
public fun request_recovery(cfg: &mut RecoveryConfig, c: &clock::Clock, ctx: &TxContext) {
    assert!(cfg.guardians.contains(ctx.sender()), ENoAccess);
    cfg.recovery_requested_at = c.timestamp_ms();
}
fun check_policy(caller: address, id: vector<u8>, cfg: &RecoveryConfig, c: &clock::Clock): bool {
    // id prefixed by cfg.id; caller is a guardian; recovery active; timelock elapsed
    let prefix = cfg.id.to_bytes(); let mut i = 0;
    if (prefix.length() > id.length()) return false;
    while (i < prefix.length()) { if (prefix[i] != id[i]) return false; i = i + 1; };
    cfg.guardians.contains(caller) && cfg.recovery_requested_at != 0
        && c.timestamp_ms() >= cfg.recovery_requested_at + cfg.timelock_ms
}
entry fun seal_approve(id: vector<u8>, cfg: &RecoveryConfig, c: &clock::Clock, ctx: &TxContext) {
    assert!(check_policy(ctx.sender(), id, cfg, c), ENoAccess);
}
```
Flow: (setup) Shamir-split secret `S` client-side into `n` shares (use a vetted `shamir-secret-sharing` lib — **Seal does not split secrets**); `encrypt` each share to id `[recoveryConfigId][index]`; store ciphertexts (Walrus/onchain/guardian) + stash each `backupKey` cold. (recovery) `request_recovery` → wait timelock → ≥m guardians each `decrypt` their share via a guardian-signed `SessionKey` → **client `shamirCombine` reconstructs `S`** (Seal never sees `S`). **m-of-n is enforced client-side at combine, NOT in `seal_approve`** (each gate call is per-share). `S` should be a separate key that is one signer of the account multisig — NOT the zkLogin key (zkLogin has no recoverable static private key).

### A.4 Enoki — login + sponsorship (method names confirmed; param keys `[VERIFY]`)
```ts
// browser login
import { EnokiFlow } from '@mysten/enoki';
const flow = new EnokiFlow({ apiKey: 'enoki_public_…' });
const url = await flow.createAuthorizationURL({ provider: 'google', clientId, redirectUrl, network: 'testnet' });
window.location.href = url;
// on redirect:
await flow.handleAuthCallback();
const keypair = await flow.getKeypair({ network: 'testnet' });   // EnokiKeypair
const address = keypair.toSuiAddress();

// sponsored (easy, client)
const { digest } = await flow.sponsorAndExecuteTransaction({ network: 'testnet', transaction: tx, client: suiClient });

// sponsored (backend control plane — private key in sponsor/)
import { EnokiClient } from '@mysten/enoki';
const enoki = new EnokiClient({ apiKey: 'enoki_private_…' });
const s = await enoki.createSponsoredTransaction({ network, sender, transactionKindBytes, allowedAddresses?, allowedMoveCallTargets? });
// user signs s.bytes → enoki.executeSponsoredTransaction({ digest: s.digest, signature });
```
**[VERIFY]** exact param keys (`transaction` vs `transactionBlock`), `createSponsoredTransaction` return shape (`{bytes,digest}`), `$zkLoginState`/`$zkLoginSession` store names, and sui#17912 (`signPersonalMessage` prepends a byte — matters when feeding Enoki signatures into Seal `SessionKey.setPersonalMessageSignature`).

### A.5 zkLogin recovery constraints (hard requirements)
OAuth-account loss = permanent lockout; salt required to re-derive the address (Enoki-managed — a recovery dependency). zkLogin-native recovery = 1-of-2 multisig across two OAuth providers. Therefore recoverable control MUST live in a multisig with the guardian-recovered key (A.3) — never "recover the zkLogin key."

*(The former companion file is now redundant; its content is inlined above and it can be deleted once out of plan mode.)*
