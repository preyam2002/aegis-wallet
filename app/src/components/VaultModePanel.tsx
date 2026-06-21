"use client";

import { ShieldCheck } from "lucide-react";

export const VaultModePanel = () => (
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
				A phished user signature is not enough; the enclave co-signer must also
				approve the PTB.
			</span>
		</div>
		<div className="policyStack secondary">
			<div>
				<span>Current proof</span>
				<strong>nitro-attested</strong>
			</div>
			<div>
				<span>Registered enclave</span>
				<strong>0xfe61...4e0e</strong>
			</div>
			<div>
				<span>Benign 2-of-2 tx</span>
				<strong>9pP9...Psyko</strong>
			</div>
			<div>
				<span>PolicyRejected</span>
				<strong>8P6f...HDQX</strong>
			</div>
			<div>
				<span>Trust model</span>
				<strong>AWS Nitro + reproducible build</strong>
			</div>
		</div>
		<p className="gateNote">
			Honest boundary: non-debug AWS Nitro testnet evidence is live and
			registered on-chain; mainnet and production availability are not claimed.
		</p>
	</section>
);
