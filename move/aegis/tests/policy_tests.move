#[test_only]
module aegis::policy_tests;

use aegis::policy::{Self, Policy, PolicyCap};
use sui::test_scenario::{Self as ts};

const ADMIN: address = @0xA11CE;
const FRIEND: address = @0xF12E;

#[test]
fun create_policy_stores_all_limits() {
    let mut scenario = ts::begin(ADMIN);

    {
        ts::next_tx(&mut scenario, ADMIN);
        policy::init_for_testing(ts::ctx(&mut scenario));
    };

    {
        ts::next_tx(&mut scenario, ADMIN);
        let cap = ts::take_from_sender<PolicyCap>(&scenario);
        policy::create_policy(
            2_500,
            1_000_000_000,
            5_000_000_000,
            vector[FRIEND],
            vector[@0x2],
            &cap,
            ts::ctx(&mut scenario),
        );
        transfer::public_transfer(cap, ADMIN);
    };

    {
        ts::next_tx(&mut scenario, ADMIN);
        let policy = ts::take_shared<Policy>(&scenario);
        assert!(policy::owner(&policy) == ADMIN, 0);
        assert!(policy::max_outflow_bps(&policy) == 2_500, 1);
        assert!(policy::per_tx_cap_mist(&policy) == 1_000_000_000, 2);
        assert!(policy::rolling_daily_cap_mist(&policy) == 5_000_000_000, 3);
        assert!(policy::allowed_recipient_count(&policy) == 1, 4);
        assert!(policy::allowed_package_count(&policy) == 1, 5);
        ts::return_shared(policy);
    };

    ts::end(scenario);
}

#[test]
fun owner_can_update_limits() {
    let mut scenario = ts::begin(ADMIN);

    {
        ts::next_tx(&mut scenario, ADMIN);
        policy::init_for_testing(ts::ctx(&mut scenario));
    };

    {
        ts::next_tx(&mut scenario, ADMIN);
        let cap = ts::take_from_sender<PolicyCap>(&scenario);
        policy::create_policy(2_500, 1, 2, vector[], vector[], &cap, ts::ctx(&mut scenario));
        transfer::public_transfer(cap, ADMIN);
    };

    {
        ts::next_tx(&mut scenario, ADMIN);
        let mut policy = ts::take_shared<Policy>(&scenario);
        policy::set_limits(&mut policy, 1_000, 10, 20, ts::ctx(&mut scenario));
        assert!(policy::max_outflow_bps(&policy) == 1_000, 0);
        assert!(policy::per_tx_cap_mist(&policy) == 10, 1);
        assert!(policy::rolling_daily_cap_mist(&policy) == 20, 2);
        ts::return_shared(policy);
    };

    ts::end(scenario);
}
