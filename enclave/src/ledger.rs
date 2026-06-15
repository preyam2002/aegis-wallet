use std::collections::HashMap;
use std::time::{Duration, SystemTime};

pub const ROLLING_WINDOW: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Debug, Default)]
pub struct SpendLedger {
    approvals: HashMap<String, Vec<ApprovedOutflow>>,
}

#[derive(Clone, Debug)]
struct ApprovedOutflow {
    tx_digest: String,
    net_outflow_mist: u64,
    approved_at: SystemTime,
}

impl SpendLedger {
    pub fn new() -> Self {
        Self::default()
    }

    /// Sums approved outflows for a vault inside the rolling window, excluding
    /// the given digest so a re-submitted transaction is not counted against itself.
    pub fn outflow_within_window(
        &mut self,
        vault_address: &str,
        exclude_tx_digest: &str,
        now: SystemTime,
    ) -> u64 {
        self.prune(vault_address, now);
        self.approvals
            .get(&vault_key(vault_address))
            .map(|entries| {
                entries
                    .iter()
                    .filter(|entry| entry.tx_digest != exclude_tx_digest)
                    .fold(0u64, |total, entry| {
                        total.saturating_add(entry.net_outflow_mist)
                    })
            })
            .unwrap_or(0)
    }

    pub fn record_approval(
        &mut self,
        vault_address: &str,
        tx_digest: &str,
        net_outflow_mist: u64,
        now: SystemTime,
    ) {
        if net_outflow_mist == 0 {
            return;
        }

        self.prune(vault_address, now);
        let entries = self.approvals.entry(vault_key(vault_address)).or_default();
        if entries.iter().any(|entry| entry.tx_digest == tx_digest) {
            return;
        }

        entries.push(ApprovedOutflow {
            tx_digest: tx_digest.to_string(),
            net_outflow_mist,
            approved_at: now,
        });
    }

    fn prune(&mut self, vault_address: &str, now: SystemTime) {
        let key = vault_key(vault_address);
        let Some(entries) = self.approvals.get_mut(&key) else {
            return;
        };

        // A backwards clock step keeps the entry: counting stale spend is the
        // conservative failure mode for a drain-prevention cap.
        entries.retain(|entry| {
            now.duration_since(entry.approved_at)
                .map(|age| age < ROLLING_WINDOW)
                .unwrap_or(true)
        });

        if entries.is_empty() {
            self.approvals.remove(&key);
        }
    }
}

fn vault_key(vault_address: &str) -> String {
    vault_address.to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(seconds: u64) -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(seconds)
    }

    #[test]
    fn sums_recorded_outflows_for_a_vault() {
        let mut ledger = SpendLedger::new();
        ledger.record_approval("0xVault", "tx-1", 1_000, at(100));
        ledger.record_approval("0xvault", "tx-2", 2_000, at(200));

        assert_eq!(
            ledger.outflow_within_window("0xvault", "tx-3", at(300)),
            3_000
        );
    }

    #[test]
    fn excludes_the_requested_digest_from_the_window_sum() {
        let mut ledger = SpendLedger::new();
        ledger.record_approval("0xvault", "tx-1", 1_000, at(100));

        assert_eq!(ledger.outflow_within_window("0xvault", "tx-1", at(200)), 0);
    }

    #[test]
    fn does_not_double_count_a_re_approved_digest() {
        let mut ledger = SpendLedger::new();
        ledger.record_approval("0xvault", "tx-1", 1_000, at(100));
        ledger.record_approval("0xvault", "tx-1", 1_000, at(200));

        assert_eq!(
            ledger.outflow_within_window("0xvault", "tx-2", at(300)),
            1_000
        );
    }

    #[test]
    fn prunes_outflows_older_than_the_rolling_window() {
        let mut ledger = SpendLedger::new();
        ledger.record_approval("0xvault", "tx-1", 1_000, at(0));

        let just_inside = at(ROLLING_WINDOW.as_secs() - 1);
        assert_eq!(
            ledger.outflow_within_window("0xvault", "tx-2", just_inside),
            1_000
        );

        let expired = at(ROLLING_WINDOW.as_secs());
        assert_eq!(ledger.outflow_within_window("0xvault", "tx-2", expired), 0);
    }

    #[test]
    fn tracks_vaults_independently() {
        let mut ledger = SpendLedger::new();
        ledger.record_approval("0xvault-a", "tx-1", 1_000, at(100));

        assert_eq!(
            ledger.outflow_within_window("0xvault-b", "tx-2", at(200)),
            0
        );
    }
}
