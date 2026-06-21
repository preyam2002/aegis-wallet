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

- **Show:** switch to the **Security** tab — Vault Mode (2-of-2 passkey + enclave) shows the live `nitro-attested` proof: registered enclave, benign 2-of-2 digest, and the on-chain `PolicyRejected` receipt. Then run the live co-sign in the terminal.
- **Backing command (live co-sign through the AWS Nitro enclave):**
  ```
  AEGIS_ENCLAVE_URL=http://127.0.0.1:3320 \
  AEGIS_REGISTERED_ENCLAVE_ID=0xb87f92d67204ec753439a46080180a0ea7cb0b1b356ddc634149821aefc951a4 \
  pnpm test:integration:vault-execute
  ```
  (Requires the SSH tunnel `ssh -N -L 3320:127.0.0.1:3000 …` to the EC2 enclave open.) It asserts the live enclave key matches the on-chain registration, executes a benign 2-of-2 transfer, sends a seeded drain to a non-allowlisted recipient, and the enclave **refuses** it — emitting a fresh `PolicyRejected`.
- **Backing digests (live run 2026-06-22):** registered enclave `0xb87f92d67204ec753439a46080180a0ea7cb0b1b356ddc634149821aefc951a4`; enclave key `db26feb8f8ac6e91980718534d87358dfa857765435cbccb9dda89f4ff40e2c3`; benign 2-of-2 `Rkm8NFgPw6MLm9ZUzySb6syBbkN9b4zcy4wDXrxvyVd`; `PolicyRejected` `CoGtcaVzqxAsev4nJJr9Fzqs6TFxBVf8Cw8hLD9GaCC` (reason `recipient is not allowlisted`). Confirm on chain with `pnpm test:integration:policy-receipts`.
- **Honest line (verbatim):** "Vault Mode is drain-resistant under the AWS-Nitro plus reproducible-build trust model — not provably un-drainable. Today's evidence is a non-debug Nitro enclave registered on testnet; mainnet and production availability are not claimed."

## Close (15s)

> "Slush has the features. Aegis has the bouncer. On Sui, that's the part nobody else is building. DeFi & Payments track — Aegis, the wallet that won't let you get drained."

## Command appendix (all referenced scripts exist in package.json)

| Beat | Command |
| --- | --- |
| 1 | `pnpm test:integration:wallet-snapshot` |
| 2 | `pnpm test:integration:simulate` |
| 3, 4 | `pnpm --filter @aegis/app test src/lib/safe-wallet-demo.test.ts` |
| 5 | `AEGIS_ENCLAVE_URL=http://127.0.0.1:3320 AEGIS_REGISTERED_ENCLAVE_ID=0xb87f92d67204ec753439a46080180a0ea7cb0b1b356ddc634149821aefc951a4 pnpm test:integration:vault-execute` (live co-sign; needs the SSH tunnel) + `pnpm test:integration:policy-receipts` |

**External (user does these):** screen + voice recording, and uploading the final video. Codex cannot record or operate the camera/mic.
