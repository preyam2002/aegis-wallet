.PHONY: build docker-build build-enclave run-local run-enclave stop-enclave logs pcrs clean test

IMAGE ?= aegis-enclave:latest
OUT_DIR ?= out
EIF ?= $(OUT_DIR)/aegis-enclave.eif
PORT ?= 3000
ENCLAVE_CID ?= 16
MEMORY_MIB ?= 2048
CPU_COUNT ?= 2

build:
	cargo build --release

docker-build:
	docker build -t $(IMAGE) .

build-enclave: docker-build
	mkdir -p $(OUT_DIR)
	nitro-cli build-enclave --docker-uri $(IMAGE) --output-file $(EIF) | tee $(OUT_DIR)/build-output.txt
	$(MAKE) pcrs

pcrs:
	@PCR0=$$(grep "PCR0" $(OUT_DIR)/build-output.txt | awk '{print $$2}' | head -1); \
	PCR1=$$(grep "PCR1" $(OUT_DIR)/build-output.txt | awk '{print $$2}' | head -1); \
	PCR2=$$(grep "PCR2" $(OUT_DIR)/build-output.txt | awk '{print $$2}' | head -1); \
	test "$${#PCR0}" = "96"; \
	test "$${#PCR1}" = "96"; \
	test "$${#PCR2}" = "96"; \
	printf '{\n  "pcr0": "%s",\n  "pcr1": "%s",\n  "pcr2": "%s"\n}\n' "$$PCR0" "$$PCR1" "$$PCR2" > $(OUT_DIR)/pcr-values.json; \
	cat $(OUT_DIR)/pcr-values.json

run-local:
	AEGIS_ENCLAVE_PORT=$(PORT) cargo run --release

run-enclave:
	nitro-cli run-enclave \
		--eif-path $(EIF) \
		--memory $(MEMORY_MIB) \
		--cpu-count $(CPU_COUNT) \
		--enclave-cid $(ENCLAVE_CID)

stop-enclave:
	nitro-cli terminate-enclave --all

logs:
	nitro-cli console --enclave-id $$(nitro-cli describe-enclaves | jq -r '.[0].EnclaveID')

clean:
	rm -rf $(OUT_DIR)
	docker rmi $(IMAGE) || true

test:
	cargo test
