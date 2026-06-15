use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::time::SystemTime;

use crate::{
    ledger::SpendLedger,
    policy::{evaluate_policy_with_window_outflow, PolicyRequest, VaultPolicy},
    sui_signature::AegisSigningKey,
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoSignRequest {
    pub tx_bytes: String,
    pub user_sig: String,
    pub vault_address: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub policy_request: Option<PolicyRequest>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum CoSignResponse {
    Signed {
        ok: bool,
        #[serde(rename = "enclaveSig")]
        enclave_sig: String,
    },
    Refused {
        ok: bool,
        reason: String,
        #[serde(rename = "rejectionReceipt", skip_serializing_if = "Option::is_none")]
        rejection_receipt: Option<String>,
    },
}

pub fn co_sign_transaction(
    policy: &VaultPolicy,
    key: &AegisSigningKey,
    request: &CoSignRequest,
    ledger: &mut SpendLedger,
    now: SystemTime,
) -> CoSignResponse {
    let Some(policy_request) = request.policy_request.as_ref() else {
        return refused("server-side simulation facts are unavailable");
    };

    let prior_window_outflow_mist =
        ledger.outflow_within_window(&request.vault_address, &policy_request.tx_digest, now);
    let decision =
        evaluate_policy_with_window_outflow(policy, policy_request, prior_window_outflow_mist);
    if !decision.allowed {
        return refused(&decision.reason);
    }

    let Ok(tx_bytes) = STANDARD.decode(&request.tx_bytes) else {
        return refused("txBytes is not valid base64");
    };

    ledger.record_approval(
        &request.vault_address,
        &policy_request.tx_digest,
        policy_request.net_outflow_mist,
        now,
    );

    CoSignResponse::Signed {
        ok: true,
        enclave_sig: key.sign_transaction_bytes(&tx_bytes),
    }
}

fn refused(reason: &str) -> CoSignResponse {
    CoSignResponse::Refused {
        ok: false,
        reason: reason.to_string(),
        rejection_receipt: None,
    }
}
