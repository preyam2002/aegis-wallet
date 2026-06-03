module aegis::recovery {
    use sui::clock::{Self, Clock};

    const ENoAccess: u64 = 1;
    const EInvalidConfig: u64 = 2;

    public struct RecoveryConfig has key {
        id: UID,
        owner: address,
        shamir_threshold: u64,
        timelock_ms: u64,
        guardians: vector<address>,
        recovery_requested_at: u64,
    }

    entry fun create_config(
        shamir_threshold: u64,
        timelock_ms: u64,
        guardians: vector<address>,
        ctx: &mut TxContext,
    ) {
        let guardian_count = vector::length(&guardians);
        assert!(guardian_count >= 2, EInvalidConfig);
        assert!(shamir_threshold >= 2, EInvalidConfig);
        assert!(shamir_threshold <= guardian_count, EInvalidConfig);

        transfer::share_object(RecoveryConfig {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            shamir_threshold,
            timelock_ms,
            guardians,
            recovery_requested_at: 0,
        });
    }

    entry fun request_recovery(
        cfg: &mut RecoveryConfig,
        c: &Clock,
        ctx: &TxContext,
    ) {
        assert!(is_guardian(cfg, tx_context::sender(ctx)), ENoAccess);
        cfg.recovery_requested_at = clock::timestamp_ms(c);
    }

    entry fun seal_approve(
        id: vector<u8>,
        cfg: &RecoveryConfig,
        c: &Clock,
        ctx: &TxContext,
    ) {
        assert!(check_policy(tx_context::sender(ctx), id, cfg, c), ENoAccess);
    }

    public fun check_policy(
        caller: address,
        id: vector<u8>,
        cfg: &RecoveryConfig,
        c: &Clock,
    ): bool {
        is_guardian(cfg, caller)
            && cfg.recovery_requested_at != 0
            && clock::timestamp_ms(c) >= cfg.recovery_requested_at + cfg.timelock_ms
            && has_config_prefix(cfg, &id)
    }

    public fun owner(cfg: &RecoveryConfig): address {
        cfg.owner
    }

    public fun shamir_threshold(cfg: &RecoveryConfig): u64 {
        cfg.shamir_threshold
    }

    public fun timelock_ms(cfg: &RecoveryConfig): u64 {
        cfg.timelock_ms
    }

    public fun guardian_count(cfg: &RecoveryConfig): u64 {
        vector::length(&cfg.guardians)
    }

    public fun recovery_requested_at(cfg: &RecoveryConfig): u64 {
        cfg.recovery_requested_at
    }

    fun is_guardian(cfg: &RecoveryConfig, caller: address): bool {
        vector::contains(&cfg.guardians, &caller)
    }

    fun has_config_prefix(cfg: &RecoveryConfig, id: &vector<u8>): bool {
        let prefix = object::uid_to_bytes(&cfg.id);
        let prefix_len = vector::length(&prefix);
        if (prefix_len > vector::length(id)) {
            return false
        };

        let mut index = 0;
        while (index < prefix_len) {
            if (prefix[index] != id[index]) {
                return false
            };
            index = index + 1;
        };

        true
    }

    #[test_only]
    public fun share_identity_for_testing(cfg: &RecoveryConfig, index: u8): vector<u8> {
        let mut id = object::uid_to_bytes(&cfg.id);
        vector::push_back(&mut id, index);
        id
    }
}
