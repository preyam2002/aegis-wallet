pub mod attestation;
pub mod cosign;
pub mod ledger;
pub mod policy;
pub mod policy_source;
pub mod simulation;
pub mod sui_signature;

#[cfg(test)]
mod policy_source_tests {
    use crate::policy_source::vault_policy_from_move_object;

    #[test]
    fn parses_vault_policy_from_sui_get_object_content() {
        let value = serde_json::json!({
            "dataType": "moveObject",
            "type": "0xpackage::policy::Policy",
            "fields": {
                "allowed_packages": [
                    "0x0000000000000000000000000000000000000000000000000000000000000002"
                ],
                "allowed_recipients": [
                    "0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a"
                ],
                "max_outflow_bps": "2500",
                "per_tx_cap_mist": "1000000000",
                "rolling_daily_cap_mist": "5000000000"
            }
        });

        let policy = vault_policy_from_move_object(&value, 10_000_000_000).unwrap();

        assert_eq!(policy.allowed_packages, vec!["0x2"]);
        assert_eq!(
            policy.allowed_recipients,
            vec!["0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a"]
        );
        assert_eq!(policy.max_outflow_bps, 2_500);
        assert_eq!(policy.per_tx_cap_mist, 1_000_000_000);
        assert_eq!(policy.rolling_daily_cap_mist, 5_000_000_000);
        assert_eq!(policy.total_mist, 10_000_000_000);
    }
}

#[cfg(test)]
mod simulation_tests {
    use crate::simulation::{derive_policy_request_from_dry_run, DryRunSimulation};

    #[test]
    fn derives_policy_request_from_sui_dry_run_transfer() {
        let dry_run: DryRunSimulation = serde_json::from_str(
            r#"{
                "effects": {
                    "status": { "status": "success" },
                    "transactionDigest": "dry-run-digest"
                },
                "balanceChanges": [
                    {
                        "owner": { "AddressOwner": "0xvault" },
                        "coinType": "0x2::sui::SUI",
                        "amount": "-1019883"
                    },
                    {
                        "owner": { "AddressOwner": "0xfriend" },
                        "coinType": "0x2::sui::SUI",
                        "amount": "123"
                    }
                ],
                "objectChanges": [
                    {
                        "type": "created",
                        "owner": { "AddressOwner": "0xfriend" },
                        "objectType": "0x2::coin::Coin<0x2::sui::SUI>",
                        "objectId": "0xcoin"
                    }
                ],
                "input": {
                    "transaction": {
                        "kind": "ProgrammableTransaction",
                        "transactions": [
                            { "SplitCoins": ["GasCoin", [{ "Input": 0 }]] },
                            { "TransferObjects": [[{ "NestedResult": [0, 0] }], { "Input": 1 }] }
                        ]
                    }
                }
            }"#,
        )
        .unwrap();

        let request = derive_policy_request_from_dry_run("0xvault", &dry_run).unwrap();

        assert_eq!(request.tx_digest, "dry-run-digest");
        assert_eq!(request.recipient, "0xfriend");
        assert_eq!(request.package, "0x2");
        assert_eq!(request.net_outflow_mist, 1_019_883);
    }
}

#[cfg(test)]
mod cosign_tests {
    use crate::{
        cosign::{co_sign_transaction, CoSignRequest, CoSignResponse},
        ledger::SpendLedger,
        policy::{PolicyRequest, VaultPolicy},
        sui_signature::AegisSigningKey,
    };
    use std::time::{Duration, SystemTime};

    fn now() -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_000_000)
    }

    fn policy() -> VaultPolicy {
        VaultPolicy {
            allowed_recipients: vec!["0xfriend".to_string()],
            allowed_packages: vec!["0x2".to_string()],
            max_outflow_bps: 2_500,
            per_tx_cap_mist: 3_000_000_000,
            rolling_daily_cap_mist: 5_000_000_000,
            total_mist: 10_000_000_000,
        }
    }

    fn request(recipient: &str, tx_digest: &str) -> CoSignRequest {
        CoSignRequest {
            tx_bytes: base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                [1u8, 2, 3],
            ),
            user_sig: "user-partial".to_string(),
            vault_address: "0xvault".to_string(),
            policy_request: Some(PolicyRequest {
                tx_digest: tx_digest.to_string(),
                recipient: recipient.to_string(),
                package: "0x2".to_string(),
                net_outflow_mist: 1_000_000_000,
            }),
        }
    }

    #[test]
    fn co_signs_when_policy_passes() {
        let key = AegisSigningKey::from_seed([7u8; 32]);
        let mut ledger = SpendLedger::new();

        let response = co_sign_transaction(
            &policy(),
            &key,
            &request("0xfriend", "demo"),
            &mut ledger,
            now(),
        );

        match response {
            CoSignResponse::Signed { enclave_sig, .. } => {
                assert_eq!(
                    base64::Engine::decode(&base64::engine::general_purpose::STANDARD, enclave_sig)
                        .unwrap()
                        .len(),
                    97
                );
            }
            CoSignResponse::Refused { reason, .. } => panic!("unexpected refusal: {reason}"),
        }
    }

    #[test]
    fn refuses_when_policy_fails() {
        let key = AegisSigningKey::from_seed([7u8; 32]);
        let mut ledger = SpendLedger::new();

        let response = co_sign_transaction(
            &policy(),
            &key,
            &request("0xattacker", "drain"),
            &mut ledger,
            now(),
        );

        match response {
            CoSignResponse::Refused { reason, .. } => {
                assert_eq!(reason, "recipient is not allowlisted");
            }
            CoSignResponse::Signed { .. } => panic!("expected refusal"),
        }
    }

    #[test]
    fn refuses_when_server_side_policy_facts_are_missing() {
        let key = AegisSigningKey::from_seed([7u8; 32]);
        let mut ledger = SpendLedger::new();
        let mut request = request("0xfriend", "demo");
        request.policy_request = None;

        let response = co_sign_transaction(&policy(), &key, &request, &mut ledger, now());

        match response {
            CoSignResponse::Refused { reason, .. } => {
                assert_eq!(reason, "server-side simulation facts are unavailable");
            }
            CoSignResponse::Signed { .. } => panic!("expected refusal"),
        }
    }

    #[test]
    fn refuses_drip_drain_that_exceeds_rolling_daily_cap_across_transactions() {
        let key = AegisSigningKey::from_seed([7u8; 32]);
        let mut ledger = SpendLedger::new();
        let mut policy = policy();
        policy.rolling_daily_cap_mist = 1_500_000_000;

        let first = co_sign_transaction(
            &policy,
            &key,
            &request("0xfriend", "tx-1"),
            &mut ledger,
            now(),
        );
        assert!(matches!(first, CoSignResponse::Signed { .. }));

        let retry = co_sign_transaction(
            &policy,
            &key,
            &request("0xfriend", "tx-1"),
            &mut ledger,
            now(),
        );
        assert!(
            matches!(retry, CoSignResponse::Signed { .. }),
            "re-signing the same digest must not double-count against the cap"
        );

        let second = co_sign_transaction(
            &policy,
            &key,
            &request("0xfriend", "tx-2"),
            &mut ledger,
            now(),
        );
        match second {
            CoSignResponse::Refused { reason, .. } => {
                assert_eq!(reason, "rolling daily outflow exceeds policy cap");
            }
            CoSignResponse::Signed { .. } => panic!("expected rolling daily cap refusal"),
        }
    }
}

#[cfg(test)]
mod sui_signature_tests {
    use crate::sui_signature::{
        serialize_ed25519_sui_signature, transaction_intent_digest, AegisSigningKey,
    };

    #[test]
    fn transaction_intent_digest_matches_mysten_sdk_vector() {
        let digest = transaction_intent_digest(&[1, 2, 3]);

        assert_eq!(
            hex::encode(digest),
            "ee461b814937755e5cd5ab7d72d521d48bc4150c1c2c52cca6d5c6666afaec9d"
        );
    }

    #[test]
    fn serializes_ed25519_signature_as_sui_partial_signature() {
        let signature = core::array::from_fn::<_, 64, _>(|i| (i + 1) as u8);
        let public_key = core::array::from_fn::<_, 32, _>(|i| (i + 65) as u8);

        let encoded = serialize_ed25519_sui_signature(&signature, &public_key);

        assert_eq!(
            encoded,
            "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYA=="
        );
    }

    #[test]
    fn signing_key_returns_public_key_and_sui_signature() {
        let key = AegisSigningKey::from_seed([7u8; 32]);

        let public_key = key.public_key_bytes();
        let signature = key.sign_transaction_bytes(&[1, 2, 3]);

        assert_eq!(public_key.len(), 32);
        assert!(signature.starts_with("A"));
        assert_eq!(
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, signature)
                .unwrap()
                .len(),
            97
        );
    }
}
