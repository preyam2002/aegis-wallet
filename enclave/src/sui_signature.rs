use base64::{engine::general_purpose::STANDARD, Engine as _};
use blake2::{
    digest::{Update, VariableOutput},
    Blake2bVar,
};
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;

const ED25519_SCHEME_FLAG: u8 = 0x00;
const TRANSACTION_DATA_INTENT: [u8; 3] = [0x00, 0x00, 0x00];

pub fn transaction_intent_digest(tx_bytes: &[u8]) -> [u8; 32] {
    let mut hasher = Blake2bVar::new(32).expect("valid digest size");
    hasher.update(&TRANSACTION_DATA_INTENT);
    hasher.update(tx_bytes);

    let mut digest = [0u8; 32];
    hasher
        .finalize_variable(&mut digest)
        .expect("fixed-size output buffer");
    digest
}

pub fn serialize_ed25519_sui_signature(signature: &[u8; 64], public_key: &[u8; 32]) -> String {
    let mut bytes = Vec::with_capacity(1 + signature.len() + public_key.len());
    bytes.push(ED25519_SCHEME_FLAG);
    bytes.extend_from_slice(signature);
    bytes.extend_from_slice(public_key);
    STANDARD.encode(bytes)
}

#[derive(Clone)]
pub struct AegisSigningKey {
    key: SigningKey,
}

impl AegisSigningKey {
    pub fn generate() -> Self {
        Self {
            key: SigningKey::generate(&mut OsRng),
        }
    }

    pub fn from_seed(seed: [u8; 32]) -> Self {
        Self {
            key: SigningKey::from_bytes(&seed),
        }
    }

    pub fn public_key_bytes(&self) -> [u8; 32] {
        self.key.verifying_key().to_bytes()
    }

    pub fn sign_transaction_bytes(&self, tx_bytes: &[u8]) -> String {
        let digest = transaction_intent_digest(tx_bytes);
        let signature = self.key.sign(&digest).to_bytes();
        serialize_ed25519_sui_signature(&signature, &self.public_key_bytes())
    }
}
