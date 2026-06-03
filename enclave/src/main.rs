use aegis_enclave::{
    attestation::nitro_attestation_document,
    cosign::{co_sign_transaction, CoSignRequest, CoSignResponse},
    policy::{evaluate_policy, PolicyDecision, PolicyRequest, VaultPolicy},
    policy_source::FullnodePolicySource,
    simulation::FullnodeSimulator,
    sui_signature::AegisSigningKey,
};
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde::Serialize;
use std::{net::SocketAddr, sync::Arc};

#[derive(Clone)]
struct AppState {
    policy: VaultPolicy,
    policy_source: FullnodePolicySource,
    signing_key: AegisSigningKey,
    simulator: FullnodeSimulator,
    allow_caller_policy_requests: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    public_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AttestationResponse {
    mode: &'static str,
    public_key: String,
    attestation: Option<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = Arc::new(AppState {
        policy: VaultPolicy {
            allowed_recipients: read_csv("AEGIS_ALLOWED_RECIPIENTS"),
            allowed_packages: read_csv("AEGIS_ALLOWED_PACKAGES"),
            max_outflow_bps: read_u64("AEGIS_MAX_OUTFLOW_BPS", 2_500),
            per_tx_cap_mist: read_u64("AEGIS_PER_TX_CAP_MIST", 0),
            rolling_daily_cap_mist: read_u64("AEGIS_ROLLING_DAILY_CAP_MIST", 0),
            total_mist: read_u64("AEGIS_TOTAL_MIST", 10_000_000_000),
        },
        policy_source: FullnodePolicySource::new(
            read_string("AEGIS_FULLNODE_RPC_URL", "https://fullnode.testnet.sui.io:443"),
            read_optional_string("AEGIS_POLICY_OBJECT_ID"),
            read_u64("AEGIS_TOTAL_MIST", 10_000_000_000),
        ),
        signing_key: read_signing_key(),
        simulator: FullnodeSimulator::new(read_string(
            "AEGIS_FULLNODE_RPC_URL",
            "https://fullnode.testnet.sui.io:443",
        )),
        allow_caller_policy_requests: read_bool("AEGIS_ALLOW_CALLER_POLICY_REQUESTS", false),
    });

    let app = Router::new()
        .route("/health_check", get(health_check))
        .route("/get_attestation", get(get_attestation))
        .route("/co_sign", post(co_sign))
        .route("/policy_check_and_cosign", post(policy_check_and_cosign))
        .with_state(state);

    let port = read_u16("AEGIS_ENCLAVE_PORT", 3000);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind enclave server");

    tracing::info!("Aegis enclave policy service listening on {}", addr);
    axum::serve(listener, app)
        .await
        .expect("serve enclave policy service");
}

async fn health_check(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "healthy",
        service: "aegis-policy-cosigner",
        public_key: hex::encode(state.signing_key.public_key_bytes()),
    })
}

async fn get_attestation(State(state): State<Arc<AppState>>) -> Json<AttestationResponse> {
    let public_key = state.signing_key.public_key_bytes();
    let attestation = nitro_attestation_document(&public_key);

    Json(AttestationResponse {
        mode: if attestation.is_ok() {
            "nitro-attested"
        } else {
            "local-unattested"
        },
        public_key: hex::encode(public_key),
        attestation: attestation.ok().map(|document| {
            base64::Engine::encode(&base64::engine::general_purpose::STANDARD, document)
        }),
    })
}

async fn co_sign(
    State(state): State<Arc<AppState>>,
    Json(mut request): Json<CoSignRequest>,
) -> Json<CoSignResponse> {
    if !(state.allow_caller_policy_requests && request.policy_request.is_some()) {
        match state
            .simulator
            .simulate_policy_request(&request.tx_bytes, &request.vault_address)
            .await
        {
            Ok(policy_request) => request.policy_request = Some(policy_request),
            Err(error) => {
                return Json(CoSignResponse::Refused {
                    ok: false,
                    reason: format!("server-side simulation failed: {error}"),
                    rejection_receipt: None,
                });
            }
        }
    }

    let policy = state.policy_source.load(&state.policy).await;

    Json(co_sign_transaction(&policy, &state.signing_key, &request))
}

async fn policy_check_and_cosign(
    State(state): State<Arc<AppState>>,
    Json(request): Json<PolicyRequest>,
) -> Json<PolicyDecision> {
    let policy = state.policy_source.load(&state.policy).await;

    Json(evaluate_policy(&policy, &request))
}

fn read_csv(name: &str) -> Vec<String> {
    std::env::var(name)
        .unwrap_or_default()
        .split(',')
        .filter(|part| !part.trim().is_empty())
        .map(|part| part.trim().to_string())
        .collect()
}

fn read_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn read_u16(name: &str, default: u16) -> u16 {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(default)
}

fn read_bool(name: &str, default: bool) -> bool {
    std::env::var(name)
        .ok()
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(default)
}

fn read_string(name: &str, default: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| default.to_string())
}

fn read_optional_string(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}

fn read_signing_key() -> AegisSigningKey {
    let Ok(seed_hex) = std::env::var("AEGIS_SIGNING_SEED_HEX") else {
        return AegisSigningKey::generate();
    };

    let bytes = hex::decode(seed_hex).expect("AEGIS_SIGNING_SEED_HEX must be hex");
    let seed: [u8; 32] = bytes
        .try_into()
        .expect("AEGIS_SIGNING_SEED_HEX must decode to 32 bytes");
    AegisSigningKey::from_seed(seed)
}
