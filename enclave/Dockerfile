FROM rust:1.86-bookworm AS builder

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim

# Runtime deps for the in-enclave init: socat (vsock<->tcp tunnels) and
# iproute2 (loopback), plus CA certs for the fullnode TLS.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates socat iproute2 \
	&& rm -rf /var/lib/apt/lists/*

# Policy is baked into the measured image so it is reflected in the PCRs: an
# attested enclave provably runs THIS policy. Override per deployment with
# --build-arg; do NOT bake any signing key (the enclave key is generated
# in-enclave and bound through the Nitro attestation public_key field).
ARG AEGIS_FULLNODE_HOST=fullnode.testnet.sui.io
ARG AEGIS_ALLOWED_RECIPIENTS=""
ARG AEGIS_ALLOWED_PACKAGES=""
ARG AEGIS_MAX_OUTFLOW_BPS=2500
ARG AEGIS_PER_TX_CAP_MIST=0
ARG AEGIS_ROLLING_DAILY_CAP_MIST=0
ARG AEGIS_TOTAL_MIST=10000000000
ARG AEGIS_POLICY_OBJECT_ID=""
ENV AEGIS_FULLNODE_HOST=${AEGIS_FULLNODE_HOST} \
	AEGIS_ALLOWED_RECIPIENTS=${AEGIS_ALLOWED_RECIPIENTS} \
	AEGIS_ALLOWED_PACKAGES=${AEGIS_ALLOWED_PACKAGES} \
	AEGIS_MAX_OUTFLOW_BPS=${AEGIS_MAX_OUTFLOW_BPS} \
	AEGIS_PER_TX_CAP_MIST=${AEGIS_PER_TX_CAP_MIST} \
	AEGIS_ROLLING_DAILY_CAP_MIST=${AEGIS_ROLLING_DAILY_CAP_MIST} \
	AEGIS_TOTAL_MIST=${AEGIS_TOTAL_MIST} \
	AEGIS_POLICY_OBJECT_ID=${AEGIS_POLICY_OBJECT_ID} \
	AEGIS_ENCLAVE_PORT=3000

COPY --from=builder /app/target/release/aegis-enclave /usr/local/bin/aegis-enclave
COPY run.sh /usr/local/bin/run.sh
RUN chmod +x /usr/local/bin/run.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/run.sh"]
