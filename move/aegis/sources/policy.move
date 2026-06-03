module aegis::policy {
    use sui::event;

    const EInvalidLimit: u64 = 1;
    const ENotOwner: u64 = 2;

    public struct PolicyCap has key, store {
        id: UID,
    }

    public struct Policy has key {
        id: UID,
        owner: address,
        max_outflow_bps: u64,
        per_tx_cap_mist: u64,
        rolling_daily_cap_mist: u64,
        allowed_recipients: vector<address>,
        allowed_packages: vector<address>,
    }

    public struct PolicyPassed has copy, drop {
        policy_id: address,
        tx_digest: vector<u8>,
        reason: vector<u8>,
    }

    public struct PolicyRejected has copy, drop {
        policy_id: address,
        tx_digest: vector<u8>,
        reason: vector<u8>,
    }

    fun init(ctx: &mut TxContext) {
        transfer::transfer(PolicyCap { id: object::new(ctx) }, tx_context::sender(ctx));
    }

    entry fun create_policy(
        max_outflow_bps: u64,
        per_tx_cap_mist: u64,
        rolling_daily_cap_mist: u64,
        allowed_recipients: vector<address>,
        allowed_packages: vector<address>,
        _cap: &PolicyCap,
        ctx: &mut TxContext,
    ) {
        assert!(max_outflow_bps <= 10_000, EInvalidLimit);

        let policy = Policy {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            max_outflow_bps,
            per_tx_cap_mist,
            rolling_daily_cap_mist,
            allowed_recipients,
            allowed_packages,
        };

        transfer::share_object(policy);
    }

    entry fun record_policy_passed(
        policy: &Policy,
        tx_digest: vector<u8>,
        reason: vector<u8>,
        _cap: &PolicyCap,
    ) {
        event::emit(PolicyPassed {
            policy_id: object::id_address(policy),
            tx_digest,
            reason,
        });
    }

    entry fun record_policy_rejected(
        policy: &Policy,
        tx_digest: vector<u8>,
        reason: vector<u8>,
        _cap: &PolicyCap,
    ) {
        event::emit(PolicyRejected {
            policy_id: object::id_address(policy),
            tx_digest,
            reason,
        });
    }

    entry fun set_limits(
        policy: &mut Policy,
        max_outflow_bps: u64,
        per_tx_cap_mist: u64,
        rolling_daily_cap_mist: u64,
        ctx: &TxContext,
    ) {
        assert_owner(policy, ctx);
        assert!(max_outflow_bps <= 10_000, EInvalidLimit);
        policy.max_outflow_bps = max_outflow_bps;
        policy.per_tx_cap_mist = per_tx_cap_mist;
        policy.rolling_daily_cap_mist = rolling_daily_cap_mist;
    }

    entry fun set_allowed_recipients(
        policy: &mut Policy,
        allowed_recipients: vector<address>,
        ctx: &TxContext,
    ) {
        assert_owner(policy, ctx);
        policy.allowed_recipients = allowed_recipients;
    }

    entry fun set_allowed_packages(
        policy: &mut Policy,
        allowed_packages: vector<address>,
        ctx: &TxContext,
    ) {
        assert_owner(policy, ctx);
        policy.allowed_packages = allowed_packages;
    }

    public fun max_outflow_bps(policy: &Policy): u64 {
        policy.max_outflow_bps
    }

    public fun per_tx_cap_mist(policy: &Policy): u64 {
        policy.per_tx_cap_mist
    }

    public fun rolling_daily_cap_mist(policy: &Policy): u64 {
        policy.rolling_daily_cap_mist
    }

    public fun owner(policy: &Policy): address {
        policy.owner
    }

    public fun allowed_recipient_count(policy: &Policy): u64 {
        vector::length(&policy.allowed_recipients)
    }

    public fun allowed_package_count(policy: &Policy): u64 {
        vector::length(&policy.allowed_packages)
    }

    fun assert_owner(policy: &Policy, ctx: &TxContext) {
        assert!(policy.owner == tx_context::sender(ctx), ENotOwner);
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
