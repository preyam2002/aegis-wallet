#!/bin/sh
# In-enclave init for the Aegis Vault co-signer.
# Adapted from the proven Aletheia Nautilus pattern, reduced to the single
# outbound dependency Aegis needs: a Sui fullnode (for dry-run simulation and
# policy-object reads). A Nitro enclave has no network of its own — all I/O
# crosses the vsock to the parent EC2 instance (well-known host CID = 3), which
# runs setup-network-proxy.sh. socat forwards raw TCP, so TLS terminates at the
# real fullnode (the host sees ciphertext only, cannot MITM contents).

set +e

FULLNODE_HOST="${AEGIS_FULLNODE_HOST:-fullnode.testnet.sui.io}"
PORT="${AEGIS_ENCLAVE_PORT:-3000}"
HOST_CID=3            # parent instance, from the enclave's point of view
SUI_VSOCK_PORT=8003   # must match setup-network-proxy.sh on the host

echo "Aegis enclave init: fullnode=${FULLNODE_HOST} port=${PORT}"

# Loopback up (required for localhost binds and the proxy hop).
ip link set dev lo up 2>/dev/null || busybox ip link set dev lo up 2>/dev/null || true
ip addr add 127.0.0.1/8 dev lo 2>/dev/null || busybox ip addr add 127.0.0.1/8 dev lo 2>/dev/null || true
ip link set dev lo up 2>/dev/null || true

echo "127.0.0.1 localhost" > /etc/hosts 2>/dev/null || true
echo "nameserver 8.8.8.8" > /etc/resolv.conf 2>/dev/null || true

# Outbound: map the fullnode host to a loopback IP and tunnel :443 over vsock to
# the host proxy. The binary connects to https://${FULLNODE_HOST}:443 and TLS
# validates against the real fullnode certificate end-to-end.
echo "127.0.0.4 ${FULLNODE_HOST}" >> /etc/hosts
socat TCP-LISTEN:443,bind=127.0.0.4,fork VSOCK-CONNECT:${HOST_CID}:${SUI_VSOCK_PORT} &
echo "Sui outbound proxy: 127.0.0.4:443 -> vsock:${HOST_CID}:${SUI_VSOCK_PORT} -> ${FULLNODE_HOST}:443"

# Inbound: expose the axum server (TCP:${PORT}) to the host over vsock so the
# wallet's /co_sign requests can reach it.
socat VSOCK-LISTEN:${PORT},reuseaddr,fork TCP:localhost:${PORT} &
echo "Inbound vsock:${PORT} -> tcp:localhost:${PORT}"

export AEGIS_FULLNODE_RPC_URL="${AEGIS_FULLNODE_RPC_URL:-https://${FULLNODE_HOST}:443}"
export AEGIS_ENCLAVE_PORT="${PORT}"

echo "Starting aegis-enclave..."
exec /usr/local/bin/aegis-enclave
