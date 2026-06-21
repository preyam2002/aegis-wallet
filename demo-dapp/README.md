# Drainer dApp — Aegis extension demo

A throwaway Sui **Wallet Standard** dApp used to demo the Aegis browser
extension's transaction bouncer. It connects to whatever wallet the page detects
(load the Aegis extension first) and proposes two real testnet PTBs:

- **Send 0.01 SUI** — benign; the Aegis popup rates it `low` and lets you Approve.
- **Drain wallet** — sends ~95% of your SUI to a burn address; the Aegis popup
  rates it `critical` ("Drains most of your balance") and **disables Approve**, so
  it never broadcasts.

Nothing is staged: both are real transactions the extension really dry-runs and
risk-scans. The drain is only ever *blocked* — it cannot execute from the popup.

## Build + serve

```bash
node demo-dapp/build.mjs                                   # bundles app.ts -> app.js
python3 -m http.server 4040 --bind 127.0.0.1 --directory demo-dapp
```

Open <http://localhost:4040>. (Content scripts inject on `http://*/*`, so the
Aegis wallet registers on localhost.)

## Demo flow

1. Load the unpacked extension (`extension/dist`) and import a funded testnet key.
2. Open <http://localhost:4040> → **Connect Aegis** → approve in the popup.
3. **Send 0.01 SUI** → popup shows the nutrition label, `low` risk → Approve → digest.
4. **Drain wallet** → popup shows `critical` "Drains most of your balance" →
   Approve is disabled → Reject. The bouncer stopped the drain.

`app.js` is a build artifact (regenerate with `node demo-dapp/build.mjs`).
