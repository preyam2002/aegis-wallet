import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Demo-only: lets the Security tab trigger the live Vault co-sign without a
// terminal. Runs the proven `test:integration:vault-execute` flow server-side
// (it needs the Sui keystore + the enclave tunnel, both local) and returns the
// digests for the UI to render.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ENCLAVE_URL = process.env.AEGIS_ENCLAVE_URL ?? "http://127.0.0.1:3320";
const REGISTERED_ENCLAVE_ID =
	process.env.AEGIS_REGISTERED_ENCLAVE_ID ??
	"0xb87f92d67204ec753439a46080180a0ea7cb0b1b356ddc634149821aefc951a4";

export type VaultDemoResult = {
	vaultAddress: string;
	digest: string;
	refusalReason: string;
	policyRejectedDigest: string;
	enclavePublicKey: string;
	attestationMode: string;
	registeredEnclaveId: string | null;
};

export const runVaultDemo = (): Promise<VaultDemoResult> =>
	new Promise((resolve, reject) => {
		const child = spawn("pnpm", ["test:integration:vault-execute"], {
			cwd: repoRoot,
			env: {
				...process.env,
				AEGIS_ENCLAVE_URL: ENCLAVE_URL,
				AEGIS_REGISTERED_ENCLAVE_ID: REGISTERED_ENCLAVE_ID,
			},
		});

		let out = "";
		let err = "";
		child.stdout.on("data", (chunk) => {
			out += chunk;
		});
		child.stderr.on("data", (chunk) => {
			err += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			const match = out.match(/\{[\s\S]*\}/);
			if (match) {
				try {
					resolve(JSON.parse(match[0]) as VaultDemoResult);
					return;
				} catch {
					// fall through to error
				}
			}
			reject(
				new Error(err.trim() || out.trim() || `vault-execute exited ${code}`),
			);
		});
	});
