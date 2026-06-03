#[test_only]
module aegis::subaccount_tests;

use aegis::subaccount::{Self, SubAccount};
use sui::clock::{Self as clock, Clock};
use sui::test_scenario::{Self as ts};

const OWNER: address = @0xA11CE;
const DAPP: address = @0xD0A9;
const STRANGER: address = @0xBAD;

#[test]
fun owner_creates_scoped_subaccount() {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, OWNER);
        subaccount::create(DAPP, 1_000_000_000, 10_000, ts::ctx(&mut scenario));
    };

    {
        ts::next_tx(&mut scenario, OWNER);
        let sub = ts::take_shared<SubAccount>(&scenario);
        assert!(subaccount::owner(&sub) == OWNER, 0);
        assert!(subaccount::dapp(&sub) == DAPP, 1);
        assert!(subaccount::max_mist(&sub) == 1_000_000_000, 2);
        assert!(subaccount::spent_mist(&sub) == 0, 3);
        assert!(!subaccount::revoked(&sub), 4);
        ts::return_shared(sub);
    };

    finish(scenario);
}

#[test]
fun dapp_records_spend_until_budget() {
    let mut scenario = setup_with_subaccount();

    {
        ts::next_tx(&mut scenario, DAPP);
        let mut sub = ts::take_shared<SubAccount>(&scenario);
        let mut c = ts::take_shared<Clock>(&scenario);
        clock::set_for_testing(&mut c, 5_000);
        subaccount::record_spend(&mut sub, 400_000_000, &c, ts::ctx(&mut scenario));
        subaccount::record_spend(&mut sub, 600_000_000, &c, ts::ctx(&mut scenario));
        assert!(subaccount::spent_mist(&sub) == 1_000_000_000, 0);
        ts::return_shared(sub);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 1, location = aegis::subaccount)]
fun non_dapp_cannot_record_spend() {
    let mut scenario = setup_with_subaccount();

    {
        ts::next_tx(&mut scenario, STRANGER);
        let mut sub = ts::take_shared<SubAccount>(&scenario);
        let c = ts::take_shared<Clock>(&scenario);
        subaccount::record_spend(&mut sub, 1, &c, ts::ctx(&mut scenario));
        ts::return_shared(sub);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 2, location = aegis::subaccount)]
fun spend_over_budget_is_denied() {
    let mut scenario = setup_with_subaccount();

    {
        ts::next_tx(&mut scenario, DAPP);
        let mut sub = ts::take_shared<SubAccount>(&scenario);
        let c = ts::take_shared<Clock>(&scenario);
        subaccount::record_spend(&mut sub, 1_000_000_001, &c, ts::ctx(&mut scenario));
        ts::return_shared(sub);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 3, location = aegis::subaccount)]
fun expired_subaccount_is_denied() {
    let mut scenario = setup_with_subaccount();

    {
        ts::next_tx(&mut scenario, DAPP);
        let mut sub = ts::take_shared<SubAccount>(&scenario);
        let mut c = ts::take_shared<Clock>(&scenario);
        clock::set_for_testing(&mut c, 10_001);
        subaccount::record_spend(&mut sub, 1, &c, ts::ctx(&mut scenario));
        ts::return_shared(sub);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 4, location = aegis::subaccount)]
fun revoked_subaccount_is_denied() {
    let mut scenario = setup_with_subaccount();

    {
        ts::next_tx(&mut scenario, OWNER);
        let mut sub = ts::take_shared<SubAccount>(&scenario);
        subaccount::revoke(&mut sub, ts::ctx(&mut scenario));
        ts::return_shared(sub);
    };

    {
        ts::next_tx(&mut scenario, DAPP);
        let mut sub = ts::take_shared<SubAccount>(&scenario);
        let c = ts::take_shared<Clock>(&scenario);
        subaccount::record_spend(&mut sub, 1, &c, ts::ctx(&mut scenario));
        ts::return_shared(sub);
        ts::return_shared(c);
    };

    finish(scenario);
}

fun setup(): ts::Scenario {
    let mut scenario = ts::begin(OWNER);

    {
        ts::next_tx(&mut scenario, OWNER);
        clock::share_for_testing(clock::create_for_testing(ts::ctx(&mut scenario)));
    };

    scenario
}

fun setup_with_subaccount(): ts::Scenario {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, OWNER);
        subaccount::create(DAPP, 1_000_000_000, 10_000, ts::ctx(&mut scenario));
    };

    scenario
}

fun finish(scenario: ts::Scenario) {
    ts::end(scenario);
}
