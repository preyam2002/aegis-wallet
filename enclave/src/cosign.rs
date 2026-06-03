use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

use crate::{
    policy::{evaluate_policy, PolicyRequest, VaultPolicy},
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
) -> CoSignResponse {
    let Some(policy_request) = request.policy_request.as_ref() else {
        return refused("server-side simulation facts are unavailable");
    };

    let decision = evaluate_policy(policy, policy_request);
    if !decision.allowed {
        return refused(&decision.reason);
    }

    let Ok(tx_bytes) = STANDARD.decode(&request.tx_bytes) else {
        return refused("txBytes is not valid base64");
    };

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
