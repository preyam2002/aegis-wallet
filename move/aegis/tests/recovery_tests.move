#[test_only]
module aegis::recovery_tests;

use aegis::recovery::{Self, RecoveryConfig};
use sui::clock::{Self as clock, Clock};
use sui::test_scenario::{Self as ts};

const OWNER: address = @0xA11CE;
const GUARDIAN: address = @0xB0B;
const BACKUP_GUARDIAN: address = @0xCAFE;
const STRANGER: address = @0xBAD;

#[test]
fun create_recovery_config_stores_guardians_and_limits() {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, OWNER);
        recovery::create_config(
            2,
            3_600_000,
            vector[GUARDIAN, BACKUP_GUARDIAN],
            ts::ctx(&mut scenario),
        );
    };

    {
        ts::next_tx(&mut scenario, OWNER);
        let cfg = ts::take_shared<RecoveryConfig>(&scenario);
        assert!(recovery::owner(&cfg) == OWNER, 0);
        assert!(recovery::shamir_threshold(&cfg) == 2, 1);
        assert!(recovery::timelock_ms(&cfg) == 3_600_000, 2);
        assert!(recovery::guardian_count(&cfg) == 2, 3);
        ts::return_shared(cfg);
    };

    finish(scenario);
}

#[test]
fun guardian_can_request_then_approve_after_timelock() {
    let mut scenario = setup_with_config();

    {
        ts::next_tx(&mut scenario, GUARDIAN);
        let mut cfg = ts::take_shared<RecoveryConfig>(&scenario);
        let mut c = ts::take_shared<Clock>(&scenario);
        clock::set_for_testing(&mut c, 1_000);
        recovery::request_recovery(&mut cfg, &c, ts::ctx(&mut scenario));
        assert!(recovery::recovery_requested_at(&cfg) == 1_000, 0);
        ts::return_shared(cfg);
        ts::return_shared(c);
    };

    {
        ts::next_tx(&mut scenario, GUARDIAN);
        let cfg = ts::take_shared<RecoveryConfig>(&scenario);
        let mut c = ts::take_shared<Clock>(&scenario);
        let id = recovery::share_identity_for_testing(&cfg, 1);
        clock::set_for_testing(&mut c, 4_600_000);
        recovery::seal_approve(id, &cfg, &c, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 1, location = aegis::recovery)]
fun non_guardian_cannot_request_recovery() {
    let mut scenario = setup_with_config();

    {
        ts::next_tx(&mut scenario, STRANGER);
        let mut cfg = ts::take_shared<RecoveryConfig>(&scenario);
        let c = ts::take_shared<Clock>(&scenario);
        recovery::request_recovery(&mut cfg, &c, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 1, location = aegis::recovery)]
fun guardian_cannot_approve_before_timelock() {
    let mut scenario = setup_with_config();

    {
        ts::next_tx(&mut scenario, GUARDIAN);
        let mut cfg = ts::take_shared<RecoveryConfig>(&scenario);
        let mut c = ts::take_shared<Clock>(&scenario);
        clock::set_for_testing(&mut c, 1_000);
        recovery::request_recovery(&mut cfg, &c, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
        ts::return_shared(c);
    };

    {
        ts::next_tx(&mut scenario, GUARDIAN);
        let cfg = ts::take_shared<RecoveryConfig>(&scenario);
        let mut c = ts::take_shared<Clock>(&scenario);
        let id = recovery::share_identity_for_testing(&cfg, 1);
        clock::set_for_testing(&mut c, 3_600_999);
        recovery::seal_approve(id, &cfg, &c, ts::ctx(&mut scenario));
        ts::return_shared(cfg);
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

fun setup_with_config(): ts::Scenario {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, OWNER);
        recovery::create_config(
            2,
            3_600_000,
            vector[GUARDIAN, BACKUP_GUARDIAN],
            ts::ctx(&mut scenario),
        );
    };

    scenario
}

fun finish(scenario: ts::Scenario) {
    ts::end(scenario);
}
