# Aegis Vault enclave — Nitro deploy (path A)

Reuses the proven AWS-Nitro setup from Aletheia (`~/repo/Aletheia/nautilus-oracle`), reduced to the single Sui-fullnode outbound leg Aegis needs. Aegis's on-chain attestation path (`aegis::attestation` + `0x2::nitro_attestation::load_nitro_attestation`) is **stronger** than Aletheia's — it verifies the doc on-chain and asserts PCR match — so we keep Aegis's Move and only borrow the EC2 + proxy infra.

> ⚠️ **Aletheia's existing `attestation.json` is NOT reusable as Aegis's trust anchor.** It is a `--debug-mode` build: PCR0/1/2 are all-zero (measures nothing) and the enclave key is bound in `user_data`, not the Nitro `public_key` field that `document.public_key()` reads (Aletheia compensated with an off-chain-trust registry). Aegis must run its **own** enclave app in **production** (no `--debug-mode`) to get real PCRs and a `public_key`-bound key. Decode any doc with `python3 scripts/decode-attestation.py <file>` to confirm non-zero PCRs before registering.

## 0. Host prereqs (the Aletheia box already satisfies these)
- Nitro-enabled EC2 instance, `nitro-cli` + `docker` installed, the nitro-enclaves allocator reserving CPU/memory, and `socat` + `jq` on the host.

## 1. Build the EIF with real PCRs (on the Nitro host)
Bake the per-deployment policy in (it becomes part of the measurement → reflected in PCRs):
```bash
cd enclave
make build-enclave BUILD_ARGS='\
  --build-arg AEGIS_POLICY_OBJECT_ID=0x<your-policy-object> \
  --build-arg AEGIS_ALLOWED_RECIPIENTS=0x<csv> \
  --build-arg AEGIS_ALLOWED_PACKAGES=0x<csv> \
  --build-arg AEGIS_MAX_OUTFLOW_BPS=2500'
# -> out/aegis-enclave.eif and out/pcr-values.json (PCR0/1/2, each 96 hex chars)
```

## 2. Run in production (NOT debug) + start the outbound proxy
```bash
make run-enclave        # production: real PCRs that match the EIF
make host-proxy         # systemd socat: vsock:8003 -> fullnode.testnet.sui.io:443
```

## 3. Bridge inbound so the wallet can reach /co_sign and /get_attestation
On the host (CID from `nitro-cli describe-enclaves`):
```bash
socat TCP-LISTEN:3000,reuseaddr,fork VSOCK-CONNECT:<ENCLAVE_CID>:3000 &
curl -s http://127.0.0.1:3000/get_attestation > attestation.json
# expect: { "mode": "nitro-attested", "publicKey": "<hex>", "attestation": "<base64 doc>" }
```
If `mode` is `local-unattested`, you are not on Nitro (or NSM is unavailable) — do not register.

## 4. Register PCR + pubkey on-chain (Aegis's strong path)
```bash
# from repo root; pairs build-time PCRs with the runtime attestation doc
AEGIS_PCRS_JSON=enclave/out/pcr-values.json \
AEGIS_ATTESTATION_PATH=enclave/attestation.json \
pnpm register:enclave
# calls aegis::attestation::create_enclave_config -> 0x2::nitro_attestation::load_nitro_attestation
# -> enclave::register_enclave<AEGIS>; asserts on-chain PCRs == config PCRs and stores document.public_key()
```

## 5. Prove the attested co-signer
```bash
pnpm test:integration:enclave-cosign   # asserts /get_attestation mode == nitro-attested, pubkey matches
pnpm test:integration:vault-execute    # attested 2-of-2 benign exec + seeded-drain refusal
pnpm test:integration:policy-receipts  # resolves the live on-chain PolicyRejected digest
```

Closes the two open acceptance tests: *reproducible-build PCRs match on-chain `EnclaveConfig`* and *drain PTB → enclave refusal + `PolicyRejected` on Explorer*.

## Trust-model notes
- socat forwards **raw TCP**; the fullnode TLS terminates inside the enclave, so the host proxy sees ciphertext only (it can delay/drop, not forge RPC responses).
- The signing key is generated **in-enclave** and never leaves; only its public key appears in the attestation. Do not bake any key into the image.
- `run-enclave-debug` exists for boot/log testing only and produces all-zero, unattestable PCRs — never register a debug enclave.
