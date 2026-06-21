#!/usr/bin/env bash
set -euo pipefail

MEMORY_MIB="${ENCLAVE_MEMORY_MIB:-2048}"
CPU_COUNT="${ENCLAVE_CPU_COUNT:-2}"
CURRENT_USER="${SUDO_USER:-$USER}"

if [[ "$(uname -s)" != "Linux" ]]; then
	echo "This must run on the Nitro-enabled EC2 parent instance, not on $(uname -s)."
	exit 1
fi

if [[ ! -r /etc/os-release ]]; then
	echo "Cannot detect Linux distribution; /etc/os-release is missing."
	exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release

install_amazon_linux_2023() {
	sudo dnf install -y aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel docker jq socat
}

install_amazon_linux_2() {
	sudo amazon-linux-extras install -y aws-nitro-enclaves-cli
	sudo yum install -y aws-nitro-enclaves-cli-devel docker jq socat
}

case "${ID}:${VERSION_ID}" in
	amzn:2023)
		install_amazon_linux_2023
		;;
	amzn:2)
		install_amazon_linux_2
		;;
	*)
		echo "Unsupported host OS: ${PRETTY_NAME:-$ID $VERSION_ID}"
		echo "Use Amazon Linux 2023 or Amazon Linux 2 for this helper."
		exit 1
		;;
esac

sudo usermod -aG ne "${CURRENT_USER}"
sudo usermod -aG docker "${CURRENT_USER}"

sudo mkdir -p /etc/nitro_enclaves
if [[ -f /etc/nitro_enclaves/allocator.yaml ]]; then
	sudo cp /etc/nitro_enclaves/allocator.yaml "/etc/nitro_enclaves/allocator.yaml.$(date +%Y%m%d%H%M%S).bak"
fi

sudo tee /etc/nitro_enclaves/allocator.yaml >/dev/null <<EOF
---
memory_mib: ${MEMORY_MIB}
cpu_count: ${CPU_COUNT}
EOF

sudo systemctl enable --now docker
sudo systemctl enable --now nitro-enclaves-allocator.service

echo "Nitro host bootstrap complete."
echo "Installed: nitro-cli, docker, jq, socat."
echo "Allocator: memory_mib=${MEMORY_MIB}, cpu_count=${CPU_COUNT}."
echo "Log out and reconnect so '${CURRENT_USER}' gets ne/docker group permissions."
echo "Then run from the Aegis repo on this host:"
echo "  cd enclave"
echo "  make build-enclave BUILD_ARGS='--build-arg AEGIS_POLICY_OBJECT_ID=0x... --build-arg AEGIS_ALLOWED_RECIPIENTS=0x... --build-arg AEGIS_ALLOWED_PACKAGES=0x2'"
echo "  make run-enclave"
echo "  make host-proxy"
