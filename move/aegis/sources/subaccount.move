module aegis::subaccount {
    use sui::clock::{Self, Clock};

    const ENotDapp: u64 = 1;
    const EBudgetExceeded: u64 = 2;
    const EExpired: u64 = 3;
    const ERevoked: u64 = 4;
    const ENotOwner: u64 = 5;

    public struct SubAccount has key {
        id: UID,
        owner: address,
        dapp: address,
        max_mist: u64,
        spent_mist: u64,
        expires_at_ms: u64,
        revoked: bool,
    }

    entry fun create(
        dapp: address,
        max_mist: u64,
        expires_at_ms: u64,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(SubAccount {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            dapp,
            max_mist,
            spent_mist: 0,
            expires_at_ms,
            revoked: false,
        });
    }

    entry fun record_spend(
        sub: &mut SubAccount,
        amount_mist: u64,
        c: &Clock,
        ctx: &TxContext,
    ) {
        assert!(tx_context::sender(ctx) == sub.dapp, ENotDapp);
        assert!(!sub.revoked, ERevoked);
        assert!(clock::timestamp_ms(c) <= sub.expires_at_ms, EExpired);
        assert!(sub.spent_mist + amount_mist <= sub.max_mist, EBudgetExceeded);

        sub.spent_mist = sub.spent_mist + amount_mist;
    }

    entry fun revoke(sub: &mut SubAccount, ctx: &TxContext) {
        assert!(tx_context::sender(ctx) == sub.owner, ENotOwner);
        sub.revoked = true;
    }

    public fun owner(sub: &SubAccount): address {
        sub.owner
    }

    public fun dapp(sub: &SubAccount): address {
        sub.dapp
    }

    public fun max_mist(sub: &SubAccount): u64 {
        sub.max_mist
    }

    public fun spent_mist(sub: &SubAccount): u64 {
        sub.spent_mist
    }

    public fun revoked(sub: &SubAccount): bool {
        sub.revoked
    }
}
