"use client";

import { ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";

const RISK_SERVICE_URL = "http://127.0.0.1:8787";

type DemoResult = {
	vaultAddress: string;
	digest: string;
	refusalReason: string;
	policyRejectedDigest: string;
};

const shortDigest = (value: string): string =>
	value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;

export const VaultModePanel = () => {
	const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
		"idle",
	);
	const [result, setResult] = useState<DemoResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const run = async () => {
		setStatus("running");
		setError(null);
		setResult(null);
		try {
			const response = await fetch(`${RISK_SERVICE_URL}/vault-demo`, {
				method: "POST",
			});
			const body = await response.json();
			if (!response.ok) {
				throw new Error(body.error ?? "co-sign failed");
			}
			setResult(body as DemoResult);
			setStatus("done");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "co-sign failed");
			setStatus("error");
		}
	};

	return (
		<section className="vaultPanel">
			<div className="sectionHeader">
				<span>
					<ShieldCheck size={16} /> Vault Mode
				</span>
				<strong>Testnet attested</strong>
			</div>
			<div className="vaultMeter">
				<ShieldCheck size={22} />
				<strong>2-of-2 co-signer guardrail</strong>
				<span>
					A phished user signature is not enough; the enclave co-signer must
					also approve the PTB.
				</span>
			</div>
			<div className="policyStack secondary">
				<div>
					<span>Current proof</span>
					<strong>nitro-attested</strong>
				</div>
				<div>
					<span>Registered enclave</span>
					<strong>0xb87f...51a4</strong>
				</div>
				<div>
					<span>Benign 2-of-2 tx</span>
					<strong>Rkm8...vyVd</strong>
				</div>
				<div>
					<span>PolicyRejected</span>
					<strong>CoGt...GaCC</strong>
				</div>
				<div>
					<span>Trust model</span>
					<strong>AWS Nitro + reproducible build</strong>
				</div>
			</div>

			<button
				type="button"
				className="primaryButton vaultDemoBtn"
				onClick={() => void run()}
				disabled={status === "running"}
			>
				{status === "running"
					? "Co-signing through the Nitro enclave…"
					: "Run a live 2-of-2 co-sign"}
			</button>

			{status === "done" && result && (
				<div className="vaultDemoResult">
					<div className="vaultDemoRow ok">
						<ShieldCheck size={16} />
						<div>
							<strong>Benign 2-of-2 executed on-chain</strong>
							<a
								href={`https://suiscan.xyz/testnet/tx/${result.digest}`}
								target="_blank"
								rel="noreferrer"
							>
								{shortDigest(result.digest)} ↗
							</a>
						</div>
					</div>
					<div className="vaultDemoRow bad">
						<ShieldX size={16} />
						<div>
							<strong>Drain refused by the enclave</strong>
							<span>{result.refusalReason}</span>
							<a
								href={`https://suiscan.xyz/testnet/tx/${result.policyRejectedDigest}`}
								target="_blank"
								rel="noreferrer"
							>
								PolicyRejected {shortDigest(result.policyRejectedDigest)} ↗
							</a>
						</div>
					</div>
				</div>
			)}
			{status === "error" && (
				<p className="errorText vaultDemoError">
					Co-sign demo couldn't run: {error}. Make sure the risk service (:8787)
					and the enclave tunnel (:3320) are up.
				</p>
			)}

			<p className="gateNote">
				Honest boundary: non-debug AWS Nitro testnet evidence is live and
				registered on-chain; mainnet and production availability are not
				claimed.
			</p>
		</section>
	);
};
