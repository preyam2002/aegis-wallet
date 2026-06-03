use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::policy::PolicyRequest;

#[derive(Clone)]
pub struct FullnodeSimulator {
    client: reqwest::Client,
    rpc_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunSimulation {
    pub effects: Value,
    #[serde(default)]
    pub balance_changes: Vec<Value>,
    #[serde(default)]
    pub object_changes: Vec<Value>,
    #[serde(default)]
    pub input: Value,
    #[serde(default)]
    pub execution_error_source: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse<T> {
    result: Option<T>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    message: String,
}

impl FullnodeSimulator {
    pub fn new(rpc_url: impl Into<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            rpc_url: rpc_url.into(),
        }
    }

    pub async fn simulate_policy_request(
        &self,
        tx_bytes: &str,
        vault_address: &str,
    ) -> Result<PolicyRequest, String> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "sui_dryRunTransactionBlock",
            "params": [tx_bytes],
        });

        let response = self
            .client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("dry-run request failed: {error}"))?;

        let rpc: JsonRpcResponse<DryRunSimulation> = response
            .json()
            .await
            .map_err(|error| format!("dry-run response was not valid JSON: {error}"))?;

        if let Some(error) = rpc.error {
            return Err(format!("dry-run RPC error: {}", error.message));
        }

        let Some(result) = rpc.result else {
            return Err("dry-run RPC response omitted result".to_string());
        };

        derive_policy_request_from_dry_run(vault_address, &result)
    }
}

pub fn derive_policy_request_from_dry_run(
    vault_address: &str,
    dry_run: &DryRunSimulation,
) -> Result<PolicyRequest, String> {
    if dry_run
        .effects
        .pointer("/status/status")
        .and_then(Value::as_str)
        .is_some_and(|status| status != "success")
    {
        let error = dry_run
            .effects
            .pointer("/status/error")
            .and_then(Value::as_str)
            .or(dry_run.execution_error_source.as_deref())
            .unwrap_or("dry-run execution failed");
        return Err(format!("simulation failed: {error}"));
    }

    let vault = normalize_address(vault_address);
    let tx_digest = dry_run
        .effects
        .get("transactionDigest")
        .and_then(Value::as_str)
        .or_else(|| dry_run.effects.get("digest").and_then(Value::as_str))
        .unwrap_or("dry-run")
        .to_string();
    let recipient = first_positive_balance_recipient(&dry_run.balance_changes, &vault)
        .or_else(|| first_external_object_owner(&dry_run.object_changes, &vault))
        .unwrap_or_else(|| vault.clone());

    Ok(PolicyRequest {
        tx_digest,
        recipient,
        package: first_package(&dry_run.input).unwrap_or_else(|| "0x2".to_string()),
        net_outflow_mist: net_outflow_mist(&dry_run.balance_changes, &vault),
    })
}

fn first_positive_balance_recipient(balance_changes: &[Value], vault: &str) -> Option<String> {
    balance_changes.iter().find_map(|change| {
        let owner = owner_address(change.get("owner")?)?;
        let amount = change.get("amount")?.as_str()?.parse::<i128>().ok()?;
        if owner != vault && amount > 0 {
            Some(owner)
        } else {
            None
        }
    })
}

fn first_external_object_owner(object_changes: &[Value], vault: &str) -> Option<String> {
    object_changes.iter().find_map(|change| {
        let owner = owner_address(change.get("owner")?)?;
        if owner != vault {
            Some(owner)
        } else {
            None
        }
    })
}

fn net_outflow_mist(balance_changes: &[Value], vault: &str) -> u64 {
    balance_changes
        .iter()
        .filter_map(|change| {
            let owner = owner_address(change.get("owner")?)?;
            if owner != vault {
                return None;
            }
            change.get("amount")?.as_str()?.parse::<i128>().ok()
        })
        .filter(|amount| *amount < 0)
        .map(|amount| amount.unsigned_abs())
        .sum::<u128>()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn first_package(input: &Value) -> Option<String> {
    let transactions = input
        .pointer("/transaction/transactions")
        .and_then(Value::as_array)?;

    for transaction in transactions {
        if let Some(package) = transaction
            .get("MoveCall")
            .and_then(|call| call.get("package"))
            .and_then(Value::as_str)
        {
            return Some(package.to_string());
        }
    }

    if transactions
        .iter()
        .any(|transaction| transaction.get("TransferObjects").is_some())
    {
        return Some("0x2".to_string());
    }

    None
}

fn owner_address(owner: &Value) -> Option<String> {
    owner
        .get("AddressOwner")
        .and_then(Value::as_str)
        .or_else(|| owner.get("ObjectOwner").and_then(Value::as_str))
        .map(normalize_address)
}

fn normalize_address(address: &str) -> String {
    address.to_ascii_lowercase()
}
