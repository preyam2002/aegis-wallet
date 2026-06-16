"use client";

import {
	type ActiveValidatorSummary,
	loadStakingOverview,
} from "@aegis/shared";
import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { loadAddressBook, loadKnownRecipients } from "../lib/address-book";
import { formatSui, shortAddress } from "../lib/amounts";
import type { SendResult } from "../lib/send-flow";
import { executeStake, previewStake } from "../lib/stake-flow";
import {
	formatMist,
	type TransactionAnalysis,
} from "../lib/transaction-analysis";
import { useWalletAccount } from "../lib/wallet-account";
import { buildDefaultWalletPolicy } from "../lib/wallet-policy";
import { getStakeReadiness } from "../lib/wallet-workflows";

type Phase = "form" | "preview" | "executing" | "done" | "error";

export const StakeModal = ({
	address,
	suiMist,
	onClose,
	onComplete,
}: {
	address: string;
	suiMist: bigint;
	onClose: () => void;
	onComplete: () => void;
}) => {
	const { client, signer } = useWalletAccount();
	const [validators, setValidators] = useState<ActiveValidatorSummary[]>([]);
	const [validator, setValidator] = useState("");
	const [amount, setAmount] = useState("1");
	const [phase, setPhase] = useState<Phase>("form");
	const [busy, setBusy] = useState(false);
	const [analysis, setAnalysis] = useState<TransactionAnalysis | null>(null);
	const [result, setResult] = useState<SendResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;
		loadStakingOverview(address)
			.then((overview) => {
				if (active) {
					setValidators(overview.topValidators);
					setValidator(overview.topValidators[0]?.address ?? "");
				}
			})
			.catch(() => {
				if (active) {
					setError("Could not load validators — testnet RPC is busy.");
				}
			});
		return () => {
			active = false;
		};
	}, [address]);

	const buildIntent = () => {
		if (!validator) {
			throw new Error("Choose a validator.");
		}
		const amountMist = BigInt(Math.round(Number(amount) * 1e9));
		const readiness = getStakeReadiness({ balanceMist: suiMist, amountMist });
		if (readiness.status === "blocked") {
			throw new Error(`${readiness.title}. ${readiness.detail}`);
		}
		return { validatorAddress: validator, amountMist };
	};

	const review = async () => {
		setError(null);
		let intent: { validatorAddress: string; amountMist: bigint };
		try {
			intent = buildIntent();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			return;
		}
		setBusy(true);
		try {
			const preview = await previewStake({
				client,
				sender: address,
				intent,
				totalMist: suiMist,
				policy: buildDefaultWalletPolicy({
					knownRecipients: loadKnownRecipients(),
				}),
				addressBook: loadAddressBook(),
			});
			setAnalysis(preview.analysis);
			setPhase("preview");
		} catch (cause) {
			setError(
				`Simulation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
			);
		} finally {
			setBusy(false);
		}
	};

	const confirm = async () => {
		if (!signer) {
			setError("Wallet is locked.");
			return;
		}
		setError(null);
		setPhase("executing");
		setBusy(true);
		try {
			const sent = await executeStake({
				client,
				signer,
				intent: buildIntent(),
			});
			setResult(sent);
			if (sent.success) {
				setPhase("done");
				onComplete();
			} else {
				setError(sent.error ?? "Transaction failed.");
				setPhase("error");
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
			setPhase("error");
		} finally {
			setBusy(false);
		}
	};

	const blocked = analysis?.riskLevel === "critical";

	return (
		<div className="modalOverlay">
			<button
				type="button"
				className="modalBackdrop"
				aria-label="Close"
				onClick={onClose}
			/>
			<div className="modalCard signingPanel" role="dialog" aria-modal="true">
				<div className="signingTitle">
					<h2>Stake SUI</h2>
					<button
						type="button"
						className="iconButton"
						aria-label="Close"
						onClick={onClose}
					>
						<X size={18} />
					</button>
				</div>

				{(phase === "form" || phase === "preview") && (
					<form
						className="formStack"
						onSubmit={(event) => {
							event.preventDefault();
							void review();
						}}
					>
						<label className="field">
							<span>Validator</span>
							<select
								className="textInput"
								value={validator}
								onChange={(event) => {
									setValidator(event.target.value);
									setPhase("form");
									setAnalysis(null);
								}}
							>
								{validators.length === 0 && <option value="">Loading…</option>}
								{validators.map((entry) => (
									<option key={entry.address} value={entry.address}>
										{entry.name ?? shortAddress(entry.address)}
									</option>
								))}
							</select>
						</label>
						<label className="field">
							<span>Amount (SUI) · min 1 · balance {formatSui(suiMist)}</span>
							<input
								className="textInput"
								value={amount}
								onChange={(event) => {
									setAmount(event.target.value);
									setPhase("form");
									setAnalysis(null);
								}}
								inputMode="decimal"
							/>
						</label>
						{phase === "form" && (
							<button className="primaryButton" type="submit" disabled={busy}>
								{busy ? "Simulating…" : "Review stake"}
							</button>
						)}
					</form>
				)}

				{phase === "preview" && analysis && (
					<>
						<div className="deltaGrid">
							<div className="deltaBox">
								<span>Net change</span>
								<strong>{formatMist(analysis.netMist)}</strong>
							</div>
							<div className="deltaBox">
								<span>Est. gas</span>
								<strong>{formatMist(analysis.gasMist)}</strong>
							</div>
							<div className={`deltaBox${blocked ? " danger" : ""}`}>
								<span>Risk</span>
								<strong>{analysis.riskLevel}</strong>
							</div>
						</div>

						<div className={`riskPill ${analysis.riskLevel}`}>
							{analysis.riskLevel === "low" ? (
								<CheckCircle2 size={15} />
							) : (
								<AlertTriangle size={15} />
							)}
							{analysis.summary}
						</div>

						<div className="findingList" style={{ marginTop: 14 }}>
							{analysis.findings.map((finding) => (
								<div
									className="findingRow"
									key={`${finding.kind}:${finding.title}`}
								>
									<AlertTriangle size={16} />
									<div>
										<strong>{finding.title}</strong>
										<span>{finding.detail}</span>
									</div>
								</div>
							))}
							{analysis.failed && (
								<div className="simulationError">{analysis.failed.detail}</div>
							)}
						</div>

						{error && <p className="errorText">{error}</p>}

						<div className="signingActions">
							<button
								type="button"
								className="rejectButton"
								onClick={() => setPhase("form")}
							>
								Edit
							</button>
							<button
								type="button"
								className="signButton sendButton"
								disabled={blocked || busy}
								onClick={() => void confirm()}
							>
								{blocked ? "Blocked — critical risk" : "Confirm & stake"}
								{!blocked && <ArrowRight size={16} />}
							</button>
						</div>
					</>
				)}

				{phase === "executing" && (
					<p className="gateLead">Signing and broadcasting…</p>
				)}

				{phase === "done" && result && (
					<div className="sendDone">
						<CheckCircle2 size={28} className="okIcon" />
						<strong>Staked</strong>
						<a
							className="linkButton"
							href={`https://suiscan.xyz/testnet/tx/${result.digest}`}
							target="_blank"
							rel="noreferrer"
						>
							{shortAddress(result.digest)} ↗
						</a>
						<button type="button" className="primaryButton" onClick={onClose}>
							Done
						</button>
					</div>
				)}

				{phase === "error" && (
					<div className="sendDone">
						<AlertTriangle size={28} className="errIcon" />
						<strong>Stake failed</strong>
						{error && <p className="errorText">{error}</p>}
						<button
							type="button"
							className="primaryButton"
							onClick={() => setPhase("form")}
						>
							Back
						</button>
					</div>
				)}
			</div>
		</div>
	);
};
