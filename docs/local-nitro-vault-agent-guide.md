# Aegis Nitro Vault Agent Guide

This is the operational guide for future agents on this machine who need to inspect, verify, or continue the Aegis Vault Mode AWS Nitro setup.

Read this with `AGENTS.md`, `HANDOFF.md`, `tasklist.md`, and `enclave/DEPLOY.md`. `tasklist.md` remains the evidence ledger; this file is the practical runbook.

## Non-negotiable boundaries

- Vault Mode is **drain-resistant under the AWS-Nitro + reproducible-build trust model**, not "provably un-drainable."
- Current attested co-signing evidence is **testnet only**. Do not claim mainnet or production Vault availability.
- The Safe Wallet layer is the shipping core and does not need an enclave.
- Aletheia's old `~/repo/Aletheia/attestation.json` is a debug build and is not a valid Aegis trust anchor. Reuse the AWS box and proven proxy pattern only.
- Never commit secrets: `.env`, keystores, `*.pem`, private keys, Sui keystore contents, or copied AWS credentials.
- Browser/screenshot evidence is not accepted unless the user explicitly re-enables it. Current proof boundary is shell-render/build checks plus real testnet command output.

## Current testnet deployment

The old Aletheia EC2 instance has been reused for Aegis. The active Aegis enclave is a non-debug AWS Nitro enclave.

| Item | Value |
| --- | --- |
| EC2 public IP | `13.51.174.115` |
| EC2 hostname | `ec2-13-51-174-115.eu-north-1.compute.amazonaws.com` |
| Region | `eu-north-1` |
| SSH user | `ec2-user` |
| SSH key path on this Mac | `/Users/preyam/Documents/Private stuff/Aletheia.pem` |
| Remote Aegis path | `~/aegis-wallet-nitro/enclave` |
| Enclave ID | `i-039f5ae93482b6dc8-enc19edadf83775c70` |
| Enclave CID | `16` |
| Enclave flags | `NONE` |
| Parent inbound bridge | `127.0.0.1:3000 -> VSOCK 16:3000` |
| Local tunnel convention | `127.0.0.1:3320 -> EC2 127.0.0.1:3000` |

SSH command:

```bash
ssh -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com
```

Tunnel command:

```bash
ssh -N -L 3320:127.0.0.1:3000 \
  -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" \
  ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com
```

The bridge is intentionally localhost-only on the EC2 parent. Do not expose `/co_sign` publicly unless the user explicitly asks and you document the risk.

## Live attestation and on-chain evidence

| Artifact | Value |
| --- | --- |
| Attestation mode | `nitro-attested` |
| Enclave public key | `533419d87e9b218e61a8128d2b86e3a2248137b92e174adb1895f0892df340d0` |
| PCR0 | `648aa0d84a78b829e873d5beb9beae5fab932c5806c01dc1dabf6689b12d4b7edaa041b4357ea8e44502220372718351` |
| PCR1 | `4b4d5b3661b3efc12920900c80e126e4ce783c522de6c02a2a5bf7af3a2b9327b86776f188e4be1c1c404a129dbda493` |
| PCR2 | `c84848bf4657351ee881c9cee596032e2e647abe465bb8309cf92021e81bd5e6be8fc2bd619ce5a450ff42ac208c855b` |
| EnclaveConfig | `0xb5f8cc7c85c21485ef75affcec55f093650e320c63e2d5d36000dc80bbd03281` |
| Registered enclave | `0xfe611cadba91b98fe81aaabfa50459375a256888951dd6e0f05a9db194b14e0e` |
| Register digest | `HyHbJq2PhnRnRcsbud2eDJhvhvo99GJk3a4T2DdkFnzZ` |
| Aegis package | `0x25989dc31ce2eb030ced1c06f0b926acabb2f893f868b1357b7032664c605d03` |
| Enclave package | `0x1c6960afd5f911c3d77c376ef96c58a93a0172e62fc3669be67839b93cc45079` |
| Live Policy object | `0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea` |
| PolicyCap | `0x9a0fe306cb2349e19c8e52a6a8ba3a5dbf2234b2f884fad44cabc144eb57d242` |
| Allowed recipient used in proof | `0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a` |
| Attested benign Vault tx | `9pP9YiQ8bYp9NxvqSCdaQTbMUkg3hw7NxY4pm48Psyko` |
| Fresh `PolicyRejected` tx | `8P6fNzmvbhraYYVmgWRzGVXKxozhPkx4eotXvoMRHDQX` |
| Rejected PTB fingerprint | `0x4288b0999362d53fad01871b4f1f18929e9f39ebdfe00573b62d14279da9fb11` |
| Rejection reason | `recipient is not allowlisted` |

Local evidence files:

- `enclave/attestation.json`
- `enclave/out/pcr-values.json`

Those files are small public evidence artifacts, not private keys. The EIF, Docker layers, `target/`, `.env`, PEMs, and keystores are not evidence files and should not be committed.

## Quick status checks

Check remote services and enclave:

```bash
ssh -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" \
  ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com \
  'systemctl is-active aegis-sui-proxy.service aegis-inbound-proxy.service && nitro-cli describe-enclaves | jq -r ".[0] | {EnclaveID, EnclaveCID, Flags}"'
```

Expected:

```text
active
active
{
  "EnclaveID": "i-039f5ae93482b6dc8-enc19edadf83775c70",
  "EnclaveCID": 16,
  "Flags": "NONE"
}
```

Check parent bridge from the EC2 host:

```bash
curl -sS http://127.0.0.1:3000/health_check
curl -sS http://127.0.0.1:3000/get_attestation | jq '{mode, publicKey, hasAttestation:(.attestation != null)}'
```

Expected mode is `nitro-attested`; expected public key is `533419d87e9b218e61a8128d2b86e3a2248137b92e174adb1895f0892df340d0`.

Check through a local tunnel:

```bash
ssh -N -L 3320:127.0.0.1:3000 \
  -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" \
  ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com
```

In another terminal:

```bash
curl -sS http://127.0.0.1:3320/health_check
curl -sS http://127.0.0.1:3320/get_attestation | jq '{mode, publicKey, hasAttestation:(.attestation != null)}'
```

Close the tunnel when done. Do not leave local tunnel sessions running after a task unless the user asks.

## Proving Vault Mode through Nitro

Start the SSH tunnel first, then run:

```bash
AEGIS_ENCLAVE_URL=http://127.0.0.1:3320 \
AEGIS_REGISTERED_ENCLAVE_ID=0xfe611cadba91b98fe81aaabfa50459375a256888951dd6e0f05a9db194b14e0e \
pnpm test:integration:vault-execute
```

Expected behavior:

- Fetches `/health_check` and `/get_attestation`.
- Requires remote mode `nitro-attested`.
- Verifies the live enclave public key matches registered on-chain `pk`.
- Builds a 2-of-2 passkey + enclave multisig address.
- Funds the vault from the active local testnet key if needed.
- Executes a benign testnet transfer.
- Sends a seeded drain PTB to the enclave and expects refusal.
- Emits a fresh on-chain `PolicyRejected` receipt for the refused PTB.

Then resolve receipts:

```bash
pnpm test:integration:policy-receipts
```

The fresh rejected digest should appear as `8P6fNzmvbhraYYVmgWRzGVXKxozhPkx4eotXvoMRHDQX` unless a newer run emitted a newer receipt.

## Local preflight

Run:

```bash
pnpm preflight:external-gates
```

The Nitro gate should be ready when `enclave/attestation.json` and `enclave/out/pcr-values.json` are present and the registered on-chain public key matches the attested public key.

Expected remaining blockers:

- `enoki-zklogin-sponsored-gas`: missing `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `ENOKI_PRIVATE_API_KEY`.
- `mainnet-deploy-and-swap-execution`: missing explicit `AEGIS_ALLOW_MAINNET_SPEND=true`.
- `browser-and-native-device-proof`: optional skipped proof unless explicitly approved.

## Rebuilding or redeploying the enclave

Only do this when the user asks or when the current enclave is stale/broken.

On the EC2 host:

```bash
cd ~/aegis-wallet-nitro/enclave
make stop-enclave || true
make build-enclave BUILD_ARGS='\
  --build-arg AEGIS_POLICY_OBJECT_ID=0xa471b39a9174305699a8561da89e8612f296c8c6d2c390acff1410b34d7305ea \
  --build-arg AEGIS_ALLOWED_RECIPIENTS=0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a \
  --build-arg AEGIS_ALLOWED_PACKAGES=0x2 \
  --build-arg AEGIS_MAX_OUTFLOW_BPS=2500'
make run-enclave
make host-proxy
curl -sS http://127.0.0.1:3000/get_attestation > /tmp/aegis-attestation.json
```

Download fresh artifacts:

```bash
scp -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" \
  ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com:~/aegis-wallet-nitro/enclave/out/pcr-values.json \
  enclave/out/pcr-values.json

scp -i "/Users/preyam/Documents/Private stuff/Aletheia.pem" \
  ec2-user@ec2-13-51-174-115.eu-north-1.compute.amazonaws.com:/tmp/aegis-attestation.json \
  enclave/attestation.json
```

Validate artifacts:

```bash
python3 -m json.tool enclave/out/pcr-values.json >/dev/null
python3 -m json.tool enclave/attestation.json >/dev/null
python3 scripts/decode-attestation.py enclave/attestation.json
```

Register on-chain:

```bash
AEGIS_PCRS_JSON=enclave/out/pcr-values.json \
AEGIS_ATTESTATION_PATH=enclave/attestation.json \
pnpm register:enclave
```

If `create_enclave_config` succeeds but immediate JSON-RPC lookup fails because the digest is not indexed yet, query the create digest later for the `EnclaveConfig` object and rerun registration with:

```bash
AEGIS_ENCLAVE_CONFIG_ID=<new-config-object-id> \
AEGIS_PCRS_JSON=enclave/out/pcr-values.json \
AEGIS_ATTESTATION_PATH=enclave/attestation.json \
pnpm register:enclave
```

After registration, update every place that hardcodes the registered enclave/config if the IDs changed:

- `scripts/external-gates-preflight.ts`
- `scripts/testnet-vault-execute.ts` docs/output expectations if relevant
- `app/src/components/VaultModePanel.tsx`
- `README.md`
- `HANDOFF.md`
- `tasklist.md`
- `docs/overflow-pitch.md`
- `docs/overflow-demo-script.md`
- `docs/overflow-submission.md`
- `docs/superpowers/plans/2026-06-04-aegis-completion.md`
- this guide

## Why Aletheia's original attestation is not reusable

Do not relitigate this unless new evidence appears:

- Aletheia's old `attestation.json` was from a debug enclave.
- PCR0/PCR1/PCR2 were all zero.
- The key was placed in `user_data`, while Aegis registration reads Nitro `document.public_key()`.
- Aletheia used weaker off-chain trust in its own registry.
- Aegis uses the stronger Sui/Nautilus path: `0x2::nitro_attestation::load_nitro_attestation` plus PCR matching and registered public key.

The conclusion is: reuse Aletheia's AWS box and proxy ideas, not its attestation doc or Move trust model.

## Remote services on the EC2 parent

Active services:

- `aegis-sui-proxy.service`: `VSOCK-LISTEN:8003 -> fullnode.testnet.sui.io:443`
- `aegis-inbound-proxy.service`: `TCP-LISTEN:3000,bind=127.0.0.1 -> VSOCK-CONNECT:16:3000`

Old Aletheia services were stopped during the Aegis deployment:

- `nautilus-openai-proxy.service`
- `nautilus-walrus-proxy.service`
- `nautilus-sui-proxy.service`
- `nautilus-socat-bridge.service`
- `nautilus-proxy.service`

Do not restart old Aletheia services unless the user is explicitly working on Aletheia.

## Important local files and scripts

- `enclave/DEPLOY.md`: public path-A Nitro runbook.
- `enclave/bootstrap-nitro-host.sh`: fresh Amazon Linux Nitro host bootstrap helper.
- `enclave/setup-network-proxy.sh`: creates both Sui outbound proxy and localhost-only inbound bridge.
- `enclave/Dockerfile`: Rust 1.86 builder and measured policy build args.
- `enclave/Makefile`: build, run, stop, logs, host-proxy, and PCR extraction.
- `scripts/decode-attestation.py`: decodes both Aletheia-style and Aegis-style attestation JSON.
- `scripts/register-nautilus-enclave.ts`: creates/registers `EnclaveConfig` and `Enclave`.
- `scripts/testnet-vault-execute.ts`: can run local enclave or remote `AEGIS_ENCLAVE_URL`; remote URL must be `nitro-attested`.
- `scripts/external-gates-preflight.ts`: canonical current gate check.
- `app/src/components/VaultModePanel.tsx`: user-facing Vault proof status.

## Validation checklist before claiming success

For docs-only changes, run at least:

```bash
git diff --check
```

For any script, app, or enclave change touching this path, run:

```bash
pnpm --filter @aegis/app test src/components/WalletDashboard.test.tsx
pnpm typecheck
pnpm lint
pnpm --filter @aegis/app build
pnpm test
CARGO_HOME=/private/tmp/aegis-cargo cargo test --manifest-path enclave/Cargo.toml
pnpm test:integration:policy-receipts
pnpm preflight:external-gates
python3 scripts/decode-attestation.py enclave/attestation.json
bash -n enclave/setup-network-proxy.sh
bash -n enclave/bootstrap-nitro-host.sh
make -C enclave -n build-enclave
git diff --check
```

For secret hygiene on touched Nitro files:

```bash
rm -rf /tmp/aegis-gitleaks-scope
mkdir -p /tmp/aegis-gitleaks-scope/enclave/out /tmp/aegis-gitleaks-scope/scripts
cp enclave/attestation.json /tmp/aegis-gitleaks-scope/enclave/attestation.json
cp enclave/out/pcr-values.json /tmp/aegis-gitleaks-scope/enclave/out/pcr-values.json
cp enclave/Dockerfile enclave/Makefile enclave/*.sh enclave/DEPLOY.md /tmp/aegis-gitleaks-scope/enclave/
cp scripts/decode-attestation.py scripts/external-gates-preflight.ts scripts/testnet-vault-execute.ts /tmp/aegis-gitleaks-scope/scripts/
gitleaks detect --no-git --source /tmp/aegis-gitleaks-scope --redact --no-banner
```

Broad `gitleaks detect --no-git --source enclave` may report false positives in Rust build metadata under `enclave/target`. Do not call those confirmed leaks without inspecting the file path.

## Current residual risks

- Testnet only. Mainnet publish and production Vault availability are still not claimed.
- Remote enclave availability depends on the EC2 instance and Nitro allocator/services staying up.
- The localhost SSH tunnel is intentionally transient. Start it only for tests and close it afterward.
- `pnpm test:integration:vault-execute` spends testnet SUI and may emit a new `PolicyRejected` receipt each run.
- Public Sui RPC can rate-limit with `RESOURCE_EXHAUSTED` or HTTP 429. Treat that as environment until reproduced after cooldown.
- Enoki/zkLogin/sponsored gas still need real env vars.
- Browser/native proof remains optional and unclaimed unless the user re-enables that evidence path.

