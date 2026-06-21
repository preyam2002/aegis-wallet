.PHONY: build docker-build build-enclave run-local run-enclave run-enclave-debug host-proxy stop-enclave logs pcrs clean test

IMAGE ?= aegis-enclave:latest
OUT_DIR ?= out
EIF ?= $(OUT_DIR)/aegis-enclave.eif
PORT ?= 3000
ENCLAVE_CID ?= 16
MEMORY_MIB ?= 2048
CPU_COUNT ?= 2
# Per-deployment policy baked into the measured image (reflected in PCRs).
# Example: make docker-build BUILD_ARGS='--build-arg AEGIS_POLICY_OBJECT_ID=0x..'
BUILD_ARGS ?=

build:
	cargo build --release

docker-build:
	docker build $(BUILD_ARGS) -t $(IMAGE) .

build-enclave: docker-build
	mkdir -p $(OUT_DIR)
	nitro-cli build-enclave --docker-uri $(IMAGE) --output-file $(EIF) | tee $(OUT_DIR)/build-output.txt
	$(MAKE) pcrs

pcrs:
	@PCR0=$$(sed -nE 's/.*"PCR0": "([0-9a-fA-F]{96})".*/\1/p; s/.*PCR0[^0-9a-fA-F]*([0-9a-fA-F]{96}).*/\1/p' $(OUT_DIR)/build-output.txt | head -1); \
	PCR1=$$(sed -nE 's/.*"PCR1": "([0-9a-fA-F]{96})".*/\1/p; s/.*PCR1[^0-9a-fA-F]*([0-9a-fA-F]{96}).*/\1/p' $(OUT_DIR)/build-output.txt | head -1); \
	PCR2=$$(sed -nE 's/.*"PCR2": "([0-9a-fA-F]{96})".*/\1/p; s/.*PCR2[^0-9a-fA-F]*([0-9a-fA-F]{96}).*/\1/p' $(OUT_DIR)/build-output.txt | head -1); \
	test "$${#PCR0}" = "96"; \
	test "$${#PCR1}" = "96"; \
	test "$${#PCR2}" = "96"; \
	printf '{\n  "pcr0": "%s",\n  "pcr1": "%s",\n  "pcr2": "%s"\n}\n' "$$PCR0" "$$PCR1" "$$PCR2" > $(OUT_DIR)/pcr-values.json; \
	cat $(OUT_DIR)/pcr-values.json

run-local:
	AEGIS_ENCLAVE_PORT=$(PORT) cargo run --release

# Production run: NO --debug-mode, so PCRs are real and match the EIF.
run-enclave:
	nitro-cli run-enclave \
		--eif-path $(EIF) \
		--memory $(MEMORY_MIB) \
		--cpu-count $(CPU_COUNT) \
		--enclave-cid $(ENCLAVE_CID)

# Debug run ONLY for boot/log testing. Yields all-zero PCRs and the attestation
# document is NOT a valid trust anchor (this is exactly why Aletheia's existing
# attestation.json is unusable for Aegis). Never register a debug enclave.
run-enclave-debug:
	@echo "⚠️  --debug-mode: PCRs will be all-zero and unattestable. Testing only."
	nitro-cli run-enclave \
		--eif-path $(EIF) \
		--memory $(MEMORY_MIB) \
		--cpu-count $(CPU_COUNT) \
		--enclave-cid $(ENCLAVE_CID) \
		--debug-mode

# Host-side outbound proxy (run on the parent EC2 after run-enclave).
host-proxy:
	./setup-network-proxy.sh

stop-enclave:
	nitro-cli terminate-enclave --all

logs:
	nitro-cli console --enclave-id $$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')

clean:
	rm -rf $(OUT_DIR)
	docker rmi $(IMAGE) || true

test:
	cargo test
