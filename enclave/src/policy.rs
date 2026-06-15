use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct VaultPolicy {
    pub allowed_recipients: Vec<String>,
    pub allowed_packages: Vec<String>,
    pub max_outflow_bps: u64,
    pub per_tx_cap_mist: u64,
    pub rolling_daily_cap_mist: u64,
    pub total_mist: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PolicyRequest {
    pub tx_digest: String,
    pub recipient: String,
    pub package: String,
    pub net_outflow_mist: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PolicyDecision {
    pub allowed: bool,
    pub reason: String,
    pub tx_digest: String,
}

pub fn evaluate_policy(policy: &VaultPolicy, request: &PolicyRequest) -> PolicyDecision {
    evaluate_policy_with_window_outflow(policy, request, 0)
}

pub fn evaluate_policy_with_window_outflow(
    policy: &VaultPolicy,
    request: &PolicyRequest,
    prior_window_outflow_mist: u64,
) -> PolicyDecision {
    if !policy
        .allowed_recipients
        .iter()
        .any(|recipient| recipient.eq_ignore_ascii_case(&request.recipient))
    {
        return reject(request, "recipient is not allowlisted");
    }

    if !policy
        .allowed_packages
        .iter()
        .any(|package| package.eq_ignore_ascii_case(&request.package))
    {
        return reject(request, "package is not allowlisted");
    }

    let outflow_bps = if policy.total_mist == 0 {
        0
    } else {
        request.net_outflow_mist.saturating_mul(10_000) / policy.total_mist
    };

    if policy.per_tx_cap_mist > 0 && request.net_outflow_mist > policy.per_tx_cap_mist {
        return reject(request, "per-tx outflow exceeds policy cap");
    }

    if outflow_bps > policy.max_outflow_bps {
        return reject(request, "net outflow exceeds policy limit");
    }

    if policy.rolling_daily_cap_mist > 0
        && prior_window_outflow_mist.saturating_add(request.net_outflow_mist)
            > policy.rolling_daily_cap_mist
    {
        return reject(request, "rolling daily outflow exceeds policy cap");
    }

    PolicyDecision {
        allowed: true,
        reason: "policy passed".to_string(),
        tx_digest: request.tx_digest.clone(),
    }
}

fn reject(request: &PolicyRequest, reason: &str) -> PolicyDecision {
    PolicyDecision {
        allowed: false,
        reason: reason.to_string(),
        tx_digest: request.tx_digest.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_policy() -> VaultPolicy {
        VaultPolicy {
            allowed_recipients: vec!["0xfriend".to_string()],
            allowed_packages: vec!["0x2".to_string(), "0xdee9".to_string()],
            max_outflow_bps: 2_500,
            per_tx_cap_mist: 10_000_000_000,
            rolling_daily_cap_mist: 5_000_000_000,
            total_mist: 10_000_000_000,
        }
    }

    #[test]
    fn allows_known_recipient_under_limit() {
        let request = PolicyRequest {
            tx_digest: "demo".to_string(),
            recipient: "0xfriend".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 1_000_000_000,
        };

        let decision = evaluate_policy(&base_policy(), &request);

        assert!(decision.allowed);
        assert_eq!(decision.reason, "policy passed");
    }

    #[test]
    fn rejects_unknown_recipient_before_signing() {
        let request = PolicyRequest {
            tx_digest: "drain".to_string(),
            recipient: "0xattacker".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 1_000_000_000,
        };

        let decision = evaluate_policy(&base_policy(), &request);

        assert!(!decision.allowed);
        assert_eq!(decision.reason, "recipient is not allowlisted");
    }

    #[test]
    fn rejects_outflow_above_policy_limit() {
        let request = PolicyRequest {
            tx_digest: "drain".to_string(),
            recipient: "0xfriend".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 7_500_000_000,
        };

        let decision = evaluate_policy(&base_policy(), &request);

        assert!(!decision.allowed);
        assert_eq!(decision.reason, "net outflow exceeds policy limit");
    }

    #[test]
    fn rejects_request_when_window_outflow_exceeds_rolling_daily_cap() {
        let mut policy = base_policy();
        policy.max_outflow_bps = 10_000;
        let request = PolicyRequest {
            tx_digest: "drip".to_string(),
            recipient: "0xfriend".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 1_500_000_000,
        };

        let decision = evaluate_policy_with_window_outflow(&policy, &request, 4_000_000_000);

        assert!(!decision.allowed);
        assert_eq!(decision.reason, "rolling daily outflow exceeds policy cap");
    }

    #[test]
    fn allows_request_within_rolling_daily_cap() {
        let mut policy = base_policy();
        policy.max_outflow_bps = 10_000;
        let request = PolicyRequest {
            tx_digest: "drip".to_string(),
            recipient: "0xfriend".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 1_500_000_000,
        };

        let decision = evaluate_policy_with_window_outflow(&policy, &request, 3_000_000_000);

        assert!(decision.allowed);
    }

    #[test]
    fn rejects_single_tx_above_rolling_daily_cap() {
        let mut policy = base_policy();
        policy.max_outflow_bps = 10_000;
        let request = PolicyRequest {
            tx_digest: "drain".to_string(),
            recipient: "0xfriend".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 6_000_000_000,
        };

        let decision = evaluate_policy(&policy, &request);

        assert!(!decision.allowed);
        assert_eq!(decision.reason, "rolling daily outflow exceeds policy cap");
    }

    #[test]
    fn rejects_outflow_above_per_tx_cap() {
        let mut policy = base_policy();
        policy.max_outflow_bps = 10_000;
        policy.per_tx_cap_mist = 1_000_000_000;
        let request = PolicyRequest {
            tx_digest: "drain".to_string(),
            recipient: "0xfriend".to_string(),
            package: "0x2".to_string(),
            net_outflow_mist: 2_000_000_000,
        };

        let decision = evaluate_policy(&policy, &request);

        assert!(!decision.allowed);
        assert_eq!(decision.reason, "per-tx outflow exceeds policy cap");
    }
}
