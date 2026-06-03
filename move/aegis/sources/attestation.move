module aegis::attestation {
    use enclave::enclave;
    use std::string::String;

    public struct AEGIS has drop {}

    fun init(ctx: &mut TxContext) {
        let cap = enclave::new_cap(AEGIS {}, ctx);
        transfer::public_transfer(cap, tx_context::sender(ctx));
    }

    public fun create_enclave_config(
        cap: &enclave::Cap<AEGIS>,
        name: String,
        pcr0: vector<u8>,
        pcr1: vector<u8>,
        pcr2: vector<u8>,
        ctx: &mut TxContext,
    ) {
        enclave::create_enclave_config<AEGIS>(cap, name, pcr0, pcr1, pcr2, ctx);
    }
}
