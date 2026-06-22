"use client";

import { CheckCircle2, Copy, KeyRound } from "lucide-react";
import { useMemo, useState } from "react";
import { shortAddress } from "../lib/amounts";
import { useWalletAccount } from "../lib/wallet-account";

export const BackupKeyScreen = () => {
	const { activeAddress, activeAccount, signer, confirmBackup, lock } =
		useWalletAccount();
	const secretKey = signer?.getSecretKey() ?? "";
	const suffix = useMemo(() => secretKey.slice(-8), [secretKey]);
	const [typed, setTyped] = useState("");
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const copy = async () => {
		await navigator.clipboard.writeText(secretKey);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const confirm = () => {
		if (!activeAddress) {
			return;
		}
		if (typed.trim() !== suffix) {
			setError("Type the last 8 characters to confirm the backup.");
			return;
		}
		confirmBackup(activeAddress);
	};

	return (
		<div className="gateWrap">
			<section className="onboardingPanel gateCard backupCard">
				<div className="gateBrand">
					<KeyRound size={22} />
					<div>
						<p className="eyebrow">Back up before funding</p>
						<h2>{activeAccount?.label ?? "New account"}</h2>
					</div>
				</div>
				<p className="gateLead">
					This password only unlocks this browser. Save the secret key before
					you send funds here.
				</p>

				<div className="secretBox">
					<span>Secret key · hover to reveal</span>
					<code>
						{secretKey || "Unlock the account to reveal the secret key."}
					</code>
				</div>

				<button
					type="button"
					className="primaryButton ghost"
					disabled={!secretKey}
					onClick={() => void copy()}
				>
					<Copy size={16} />
					{copied ? "Copied" : "Copy secret key"}
				</button>

				<form
					className="formStack"
					onSubmit={(event) => {
						event.preventDefault();
						confirm();
					}}
				>
					<label className="field">
						<span>Type the last 8 characters</span>
						<input
							className="textInput"
							value={typed}
							onChange={(event) => {
								setTyped(event.target.value);
								setError(null);
							}}
							placeholder={suffix || "last 8"}
							autoComplete="off"
							spellCheck={false}
						/>
					</label>
					{error && <p className="errorText">{error}</p>}
					<button
						type="submit"
						className="primaryButton"
						disabled={!secretKey || typed.trim() !== suffix}
					>
						<CheckCircle2 size={16} />I saved this backup
					</button>
				</form>

				<p className="gateNote">
					{activeAddress ? <code>{shortAddress(activeAddress)}</code> : null}
					Do not store mainnet funds here until the backup is saved.
				</p>
				<button type="button" className="linkButton" onClick={lock}>
					Lock instead
				</button>
			</section>
		</div>
	);
};
