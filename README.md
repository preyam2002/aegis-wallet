# Aegis Wallet

Aegis is a Sui wallet product prototype with two independent tracks:

- **Safe Wallet:** a daily-driver signing surface that turns simulated transaction effects into plain net balance/object movement, package risk, recipient risk, and address-poisoning warnings.
- **Vault Mode:** an opt-in attested co-signer path. The current repo contains the local policy service and Move receipt boundary; live AWS Nitro/Nautilus attestation is still a Phase-0 spike, not a completed guarantee.

## Structure

| Path | Purpose |
| --- | --- |
| `app/` | Next.js web wallet shell and deterministic transaction analyzer |
| `extension/` | Browser-extension MV3 manifest and origin-scoped dApp bridge |
| `enclave/` | Rust policy co-signer service shaped after Aletheia's Nautilus oracle boundary |
| `mobile/` | Mobile wallet shell model and Expo-style native app bundle generator |
| `move/` | Sui Move policy receipt module for `PolicyPassed` / `PolicyRejected` events |
| `sponsor/` | Enoki private-key sponsorship control plane for zero-gas onboarding |

## Commands

```bash
pnpm install --ignore-scripts
pnpm --filter @aegis/app exec vitest run
pnpm --filter @aegis/app typecheck
pnpm --filter @aegis/app dev
pnpm preflight:external-gates
pnpm --filter @aegis/extension test
pnpm build:extension
pnpm test:integration:extension-background
pnpm test:integration:extension-content
pnpm test:integration:extension-popup
pnpm --filter @aegis/mobile test
pnpm build:mobile
pnpm test:integration:mobile-bundle
pnpm exec tsc --noEmit --project mobile/dist/tsconfig.json
pnpm --filter @aegis/sponsor test
pnpm test:integration:activity
pnpm test:integration:portfolio
pnpm test:integration:portfolio-value
pnpm test:integration:token-metadata
pnpm test:integration:wallet-snapshot
pnpm test:integration:send
pnpm test:integration:staking-overview
pnpm test:integration:localnet-stake

cd enclave
CARGO_HOME=/private/tmp/aegis-cargo cargo test

cd ../move
MOVE_HOME=/private/tmp/aegis-move-home sui move test
```

## Trust Model

Vault Mode should be described narrowly: it blocks configured drain classes when the transaction requires both the user signature and a reachable enclave co-signature, and when the enclave PCR/public key is registered and verified on-chain. This is a TEE plus reproducible-build trust model, not ZK and not unconditional un-drainability.
