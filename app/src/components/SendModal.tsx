"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import {
	loadAddressBook,
	loadKnownRecipients,
	rememberRecipient,
} from "../lib/address-book";
import { formatSui, parseSuiToMist, shortAddress } from "../lib/amounts";
import { executeSend, previewSend, type SendResult } from "../lib/send-flow";
import {
	formatMist,
	type TransactionAnalysis,
} from "../lib/transaction-analysis";
import { useWalletAccount } from "../lib/wallet-account";
import { buildDefaultWalletPolicy } from "../lib/wallet-policy";
import { getSendReadiness } from "../lib/wallet-workflows";

const ADDRESS_RE = /^0x[0-9a-fA-F]{64}$/;

type Phase = "form" | "preview" | "executing" | "done" | "error";

export const SendModal = ({
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
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [phase, setPhase] = useState<Phase>("form");
	const [busy, setBusy] = useState(false);
	const [analysis, setAnalysis] = useState<TransactionAnalysis | null>(null);
	const [result, setResult] = useState<SendResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const parseIntent = (): { recipientAddress: string; amountMist: bigint } => {
		const recipientAddress = recipient.trim();
		if (!ADDRESS_RE.test(recipientAddress)) {
			throw new Error("Enter a valid 0x… Sui address (64 hex chars).");
		}
		const amountMist = parseSuiToMist(amount);
		const readiness = getSendReadiness({ balanceMist: suiMist, amountMist });
		if (readiness.status === "blocked") {
			throw new Error(`${readiness.title}. ${readiness.detail}`);
		}
		return { recipientAddress, amountMist };
	};

	const review = async () => {
		setError(null);
		let intent: { recipientAddress: string; amountMist: bigint };
		try {
			intent = parseIntent();
		} catch (cause) {
			setError(String(cause instanceof Error ? cause.message : cause));
			return;
		}

		setBusy(true);
		try {
			const preview = await previewSend({
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
			const intent = parseIntent();
			const sent = await executeSend({ client, signer, intent });
			setResult(sent);
			if (sent.success) {
				rememberRecipient(intent.recipientAddress);
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
					<h2>Send SUI</h2>
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
							<span>Recipient</span>
							<input
								className="textInput"
								value={recipient}
								onChange={(event) => {
									setRecipient(event.target.value);
									setPhase("form");
									setAnalysis(null);
								}}
								placeholder="0x…"
								autoComplete="off"
								spellCheck={false}
							/>
						</label>
						<label className="field">
							<span>Amount (SUI) · balance {formatSui(suiMist)} </span>
							<input
								className="textInput"
								value={amount}
								onChange={(event) => {
									setAmount(event.target.value);
									setPhase("form");
									setAnalysis(null);
								}}
								placeholder="0.0"
								inputMode="decimal"
							/>
						</label>
						{phase === "form" && (
							<button className="primaryButton" type="submit" disabled={busy}>
								{busy ? "Simulating…" : "Review transaction"}
							</button>
						)}
					</form>
				)}

				{phase === "preview" && analysis && (
					<>
						<div className="flowStrip">
							<div>
								<span>You send</span>
								<strong>{formatMist(analysis.netMist)}</strong>
							</div>
							<div className="flowLine" />
							<div>
								<span>To</span>
								<strong>{shortAddress(recipient.trim())}</strong>
							</div>
						</div>

						<div className="deltaGrid">
							<div className="deltaBox">
								<span>Net change</span>
								<strong>{formatMist(analysis.netMist)}</strong>
							</div>
							<div className="deltaBox">
								<span>Est. gas</span>
								<strong>{formatMist(analysis.gasMist)}</strong>
							</div>
							<div className="deltaBox">
								<span>Objects leaving</span>
								<strong>{analysis.netObjects.length}</strong>
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
								className="signButton"
								disabled={blocked || busy}
								onClick={() => void confirm()}
							>
								{blocked ? "Blocked — critical risk" : "Confirm & send"}
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
						<strong>Sent</strong>
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
						<strong>Transaction failed</strong>
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
