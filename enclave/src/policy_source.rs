use serde::Deserialize;
use serde_json::{json, Value};

use crate::policy::VaultPolicy;

#[derive(Clone)]
pub struct FullnodePolicySource {
    client: reqwest::Client,
    rpc_url: String,
    object_id: Option<String>,
    total_mist: u64,
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

impl FullnodePolicySource {
    pub fn new(rpc_url: impl Into<String>, object_id: Option<String>, total_mist: u64) -> Self {
        Self {
            client: reqwest::Client::new(),
            rpc_url: rpc_url.into(),
            object_id,
            total_mist,
        }
    }

    pub async fn load(&self, fallback: &VaultPolicy) -> VaultPolicy {
        let Some(object_id) = self.object_id.as_deref() else {
            return fallback.clone();
        };

        match self.fetch_policy(object_id).await {
            Ok(policy) => policy,
            Err(error) => {
                tracing::warn!("using fallback policy after object fetch failed: {}", error);
                fallback.clone()
            }
        }
    }

    async fn fetch_policy(&self, object_id: &str) -> Result<VaultPolicy, String> {
        let body = json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "sui_getObject",
            "params": [object_id, { "showContent": true }],
        });

        let response = self
            .client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("policy object request failed: {error}"))?;

        let rpc: JsonRpcResponse<Value> = response
            .json()
            .await
            .map_err(|error| format!("policy object response was not valid JSON: {error}"))?;

        if let Some(error) = rpc.error {
            return Err(format!("policy object RPC error: {}", error.message));
        }

        let Some(result) = rpc.result else {
            return Err("policy object RPC response omitted result".to_string());
        };
        let Some(content) = result.pointer("/data/content") else {
            return Err("policy object response omitted data.content".to_string());
        };

        vault_policy_from_move_object(content, self.total_mist)
    }
}

pub fn vault_policy_from_move_object(
    content: &Value,
    total_mist: u64,
) -> Result<VaultPolicy, String> {
    let fields = content
        .get("fields")
        .ok_or_else(|| "policy content omitted fields".to_string())?;

    Ok(VaultPolicy {
        allowed_recipients: address_vector(fields, "allowed_recipients")?,
        allowed_packages: address_vector(fields, "allowed_packages")?,
        max_outflow_bps: string_u64(fields, "max_outflow_bps")?,
        per_tx_cap_mist: string_u64(fields, "per_tx_cap_mist")?,
        rolling_daily_cap_mist: string_u64(fields, "rolling_daily_cap_mist")?,
        total_mist,
    })
}

fn address_vector(fields: &Value, key: &str) -> Result<Vec<String>, String> {
    let Some(values) = fields.get(key).and_then(Value::as_array) else {
        return Err(format!("policy field {key} is not an address vector"));
    };

    values
        .iter()
        .map(|value| {
            let address = value
                .as_str()
                .ok_or_else(|| format!("policy field {key} contains a non-address"))?;
            Ok(normalize_sui_address(address))
        })
        .collect()
}

fn string_u64(fields: &Value, key: &str) -> Result<u64, String> {
    let value = fields
        .get(key)
        .ok_or_else(|| format!("policy field {key} is missing"))?;

    if let Some(number) = value.as_u64() {
        return Ok(number);
    }

    value
        .as_str()
        .ok_or_else(|| format!("policy field {key} is not a string or number"))?
        .parse()
        .map_err(|error| format!("policy field {key} is not a u64: {error}"))
}

fn normalize_sui_address(address: &str) -> String {
    let normalized = address.to_ascii_lowercase();
    let body = normalized.strip_prefix("0x").unwrap_or(&normalized);
    let trimmed = body.trim_start_matches('0');

    if trimmed.is_empty() {
        "0x0".to_string()
    } else {
        format!("0x{trimmed}")
    }
}
