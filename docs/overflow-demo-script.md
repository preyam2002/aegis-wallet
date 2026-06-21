# Aegis — Demo Run-of-Show

Target length: ~3 minutes. Every beat maps to a real, reproducible command or a live testnet digest — no faked steps. Theme, stated once up front and never dropped: **"Aegis won't let you get drained."**

## Cold open (10s)

> "On Ethereum, your wallet has a bouncer — Blockaid, ScamSniffer. On Sui, there's nobody at the door. Aegis is that bouncer."

## Beat 1 — Open the wallet (20s)

- **Show:** the dashboard — live testnet portfolio, USD value, activity feed, NFT/DeFi rows.
- **Backing command:** `pnpm test:integration:wallet-snapshot` (live testnet read for active address `0x89c2…5338a`: portfolio rows, activity rows, DeFi rows, USD total).
- **Say:** "Real on-chain data. Now watch what happens when I try to do something dangerous."

## Beat 2 — A normal send, explained in plain English (25s)

- **Show:** compose a small send; the pre-sign screen renders *you send X, you receive Y, objects leaving, gas* — green, no warnings.
- **Backing command:** `pnpm test:integration:simulate` (maps a real testnet PTB into `SimSummary`).
- **Backing digest:** native send `8TDM767CrrSWpRmH6xFjuFuedCTSDNb8kyvuc48jCs4B` (recipient `+1000` MIST, sender `-1998880` MIST) — proof the simulate→diff path reflects real chain effects.
- **Say:** "This is the nutrition label. Every transaction, before you sign."

## Beat 3 — Aegis blocks a drainer (35s) ★ the money shot

- **Show:** feed a transfer whose recipient is on the curated drainer denylist; the signing screen turns red and refuses to go green.
- **Backing command:** `pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts`
- **Exact copy on screen:** finding **"Known drainer recipient" — "The recipient is on the configured blocklist."** (risk level `critical`).
- **Also show (same test file):** a full wallet **sweep** → "Wallet sweep" / "This transaction empties the wallet's SUI balance." and an **unverified package** → "Untrusted package".
- **Say:** "One signed PTB is how Sui wallets get drained. Aegis reads the simulation and stops it."

## Beat 4 — Address-poisoning caught (25s)

- **Show:** paste a look-alike of a saved contact (same first/last characters, different middle); Aegis throws a blocking side-by-side comparison.
- **Backing command:** `pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts`
- **Exact copy on screen:** finding **"Address looks like a saved contact" — "0x9999…0001 has the same prefix and same suffix as Treasury."**
- **Say:** "Poisoning attacks rely on you not reading the middle of the address. Aegis reads it for you."

## Beat 5 — Vault Mode refuses a drain on-chain (30s)

- **Show:** switch to the **Security** tab. Vault Mode (2-of-2 passkey + enclave) shows the `nitro-attested` proof — registered enclave, the benign 2-of-2 digest, and the on-chain `PolicyRejected` receipt from a seeded drain the co-signer refused. The under-signed tx cannot land.
- **Backing command:** `pnpm test:integration:policy-receipts` — re-queries the live on-chain `PolicyPassed` / `PolicyRejected` receipts via `suix_queryEvents`, so the digest on screen is verifiable against the chain in real time (no enclave/tunnel needed).
- **Backing digests:** attested benign 2-of-2 execution `9pP9YiQ8bYp9NxvqSCdaQTbMUkg3hw7NxY4pm48Psyko`; on-chain `PolicyRejected` `8P6fNzmvbhraYYVmgWRzGVXKxozhPkx4eotXvoMRHDQX` (reason `recipient is not allowlisted`); registered enclave `0xfe611cadba91b98fe81aaabfa50459375a256888951dd6e0f05a9db194b14e0e`.
- **Honest line (verbatim):** "Vault Mode is drain-resistant under the AWS-Nitro plus reproducible-build trust model — not provably un-drainable. Today's evidence is a non-debug Nitro enclave registered on testnet; mainnet and production availability are not claimed."
- **Optional deeper proof (only if you want a live co-sign on camera):** bring the EC2 Nitro enclave up to current registration and run `AEGIS_ENCLAVE_URL=http://127.0.0.1:3320 AEGIS_REGISTERED_ENCLAVE_ID=<current> pnpm test:integration:vault-execute`. Skipped by default — the enclave reboots with a fresh ephemeral key, so this needs an on-chain re-registration first.

## Close (15s)

> "Slush has the features. Aegis has the bouncer. On Sui, that's the part nobody else is building. DeFi & Payments track — Aegis, the wallet that won't let you get drained."

## Command appendix (all referenced scripts exist in package.json)

| Beat | Command |
| --- | --- |
| 1 | `pnpm test:integration:wallet-snapshot` |
| 2 | `pnpm test:integration:simulate` |
| 3, 4 | `pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts` |
| 5 | `pnpm test:integration:policy-receipts` (live re-query of the on-chain receipts; `vault-execute` is optional and needs the enclave re-registered first) |

**External (user does these):** screen + voice recording, and uploading the final video. Codex cannot record or operate the camera/mic.
