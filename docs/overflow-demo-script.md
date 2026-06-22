# Aegis — Demo Run-of-Show

Target length: ~3 minutes. Every beat is a real, live action — no faked steps. Theme, stated once and never dropped: **"Aegis is the bouncer for your Sui wallet — now AI-powered, and it won't let you get drained."**

## Pre-record setup (do this off-camera)

| What | Command / action |
| --- | --- |
| App + live log | `pnpm --filter @aegis/app dev` → `http://localhost:3030` (and `/activity`) |
| Demo dApp | `python3 -m http.server 4040 --bind 127.0.0.1 --directory demo-dapp` → `http://localhost:4040` |
| AI risk service | `ANTHROPIC_API_KEY=sk-ant-… pnpm --filter @aegis/risk-service dev` → `:8787` |
| Vault enclave tunnel | `ssh -N -L 3320:127.0.0.1:3000 -i <pem> ec2-user@<EC2_HOST>` (for Beat 5) |
| Extension | `chrome://extensions` → Developer mode → **Load unpacked** → `extension/dist` |
| Import the funded key | Aegis popup → **Import** → paste `suiprivkey…` (from `sui keytool export --key-identity cool-dichroite`) → set a password. **Do this before recording** — the field is masked, but don't film the paste. |
| Windows | Have the **demo dApp**, the **Aegis popup**, the **`/activity` tab**, and a **terminal** ready. |

Keep `:8787` and the `:3320` tunnel up for the whole take. Rotate the API key afterward.

## Cold open (10s)

> "On Ethereum your wallet has a bouncer — Blockaid, ScamSniffer. On Sui, there's nobody at the door. Aegis is that bouncer — and it reads every transaction with AI before you sign."

## Beat 1 — A real wallet a real dApp connects to (20s)

- **Show:** open the dApp at `localhost:4040` → click **Connect** → pick **Aegis** in the modal → approve in the Aegis popup.
- **Say:** "Aegis is a real Sui Wallet Standard wallet — any dApp detects it. Watch what happens when this site asks me to sign."

## Beat 2 — The AI reads a normal transaction (30s)

- **Show:** click **Send 0.01 SUI**. The Aegis popup opens with an **"Aegis AI analysis"** block: a plain-English verdict (low risk), the diff (you send / gas / objects), then **Approve** → a real testnet digest.
- **Say:** "Every transaction gets simulated, then Claude explains in plain English what it actually does. This one's a tiny transfer — low risk — so I can approve."
- **Backing:** the verdict is a live call to the Aegis risk service (`POST /assess` → Claude Haiku 4.5).

## Beat 3 — The AI blocks a drainer (35s) ★ the money shot

- **Show:** click **Drain wallet**. The popup turns red: the AI headline calls it a **drainer**, explains it sends ~95% of your SUI to an address you've never used, and **Approve is disabled — blocked.**
- **Say:** "This is a malicious dApp trying to drain me. The AI caught it — sends most of my balance to a fresh address, almost certainly a drainer — and Aegis won't let me sign. That's the whole product."
- **Honest line:** "Behind the AI there's a deterministic floor — a 95% outflow is hard-blocked no matter what the model says — so a bad model can never wave a drain through."

## Beat 4 — A live wall of every decision (20s)

- **Show:** switch to the **`/activity`** tab — the transactions you just did stream in: a green **approved** row and a red **BLOCKED** row, with the AI headline and the dApp origin, in real time.
- **Say:** "Everything the bouncer sees is streamed to a live log — every block, every approval, as it happens."

## Beat 5 — Vault Mode: hardware-enforced refusal (30s)

- **Show (no terminal):** open the **Security** tab → click **"Run a live 2-of-2 co-sign."** After ~20–30s the panel shows, on screen: the **benign 2-of-2 executed** (Suiscan link) and the enclave's **drain refusal** + on-chain **PolicyRejected** (Suiscan link). The attested-enclave proof is right above it.
- **Backing:** the button POSTs to the local risk service, which co-signs through the AWS Nitro enclave over the SSH tunnel (`:3320`) — same proven flow as `pnpm test:integration:vault-execute`. Each click prints fresh digests (a small amount of testnet SUI moves; the drain is only ever refused). Needs `:8787` + the `:3320` tunnel up.
- **Honest line (verbatim):** "Vault Mode is drain-resistant under the AWS-Nitro plus reproducible-build trust model — not provably un-drainable. This is a non-debug Nitro enclave registered on testnet; mainnet and production are not claimed."

## Close (15s)

> "Slush has the features. Aegis has the bouncer — and now an AI that reads every transaction and a hardware vault that refuses drains on-chain. On Sui, that's the part nobody else is building. DeFi & Payments — Aegis, the wallet that won't let you get drained."

## Backing-command appendix (all real, all live)

| Beat | Proof |
| --- | --- |
| 2 | live `POST /assess` (Claude Haiku 4.5) — the verdict in the popup |
| 3 | same `/assess` returns `critical` for the ~95% drain; deterministic floor also blocks |
| 4 | extension `POST /decisions` → risk-service SSE `/stream` → `/activity` feed |
| 5 | `AEGIS_ENCLAVE_URL=… AEGIS_REGISTERED_ENCLAVE_ID=0xb87f…51a4 pnpm test:integration:vault-execute`, then `pnpm test:integration:policy-receipts` |

**External (user does these):** screen + voice recording and uploading the final video. The drain in Beats 3 and 5 is only ever *blocked/refused* — no funds move.
