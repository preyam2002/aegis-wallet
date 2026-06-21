#!/bin/bash
# Host-side (parent EC2) outbound proxy for the Aegis Vault enclave.
# Adapted from Aletheia's proven Nautilus proxy, reduced to the single Sui
# fullnode leg Aegis needs. Run this on the Nitro-enabled instance AFTER the
# enclave is running (it reads the live enclave CID). socat forwards raw TCP, so
# the fullnode's TLS is preserved end-to-end into the enclave.
set -e

FULLNODE_HOST="${AEGIS_FULLNODE_HOST:-fullnode.testnet.sui.io}"
SUI_VSOCK_PORT="${AEGIS_SUI_VSOCK_PORT:-8003}"
INBOUND_PORT="${AEGIS_INBOUND_PORT:-3000}"
ENCLAVE_PORT="${AEGIS_ENCLAVE_PORT:-3000}"

ENCLAVE_CID=$(sudo nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID')
if [ "$ENCLAVE_CID" = "null" ] || [ -z "$ENCLAVE_CID" ]; then
  echo "❌ No enclave running (start it with: make run-enclave)"
  exit 1
fi
echo "Enclave CID: $ENCLAVE_CID  ->  proxying Sui fullnode ${FULLNODE_HOST}:443"

command -v socat >/dev/null 2>&1 || sudo yum install -y socat || sudo apt-get install -y socat

# Outbound: enclave reaches the fullnode by connecting (over vsock) to the
# host's VSOCK-LISTEN:${SUI_VSOCK_PORT}, which socat forwards to the real RPC.
sudo tee /etc/systemd/system/aegis-sui-proxy.service > /dev/null <<EOF
[Unit]
Description=Aegis Vault Sui RPC vsock proxy
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/socat VSOCK-LISTEN:${SUI_VSOCK_PORT},reuseaddr,fork TCP:${FULLNODE_HOST}:443
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo tee /etc/systemd/system/aegis-inbound-proxy.service > /dev/null <<EOF
[Unit]
Description=Aegis Vault inbound localhost bridge
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:${INBOUND_PORT},bind=127.0.0.1,reuseaddr,fork VSOCK-CONNECT:${ENCLAVE_CID}:${ENCLAVE_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable aegis-sui-proxy
sudo systemctl restart aegis-sui-proxy
sudo systemctl enable aegis-inbound-proxy
sudo systemctl restart aegis-inbound-proxy

echo "✅ aegis-sui-proxy up: vsock:${SUI_VSOCK_PORT} -> ${FULLNODE_HOST}:443"
echo "✅ aegis-inbound-proxy up: 127.0.0.1:${INBOUND_PORT} -> vsock:${ENCLAVE_CID}:${ENCLAVE_PORT}"
echo "   From your laptop: ssh -N -L 3320:127.0.0.1:${INBOUND_PORT} <nitro-host>"
echo "   Then set AEGIS_ENCLAVE_URL=http://127.0.0.1:3320"
