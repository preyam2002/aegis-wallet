"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { shortAddress } from "../lib/amounts";
import { useWalletAccount } from "../lib/wallet-account";

export const UnlockScreen = () => {
	const { unlock, accounts, activeAddress, removeAccount } = useWalletAccount();
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const active = accounts.find((account) => account.address === activeAddress);

	const submit = async () => {
		setError(null);
		setBusy(true);
		try {
			await unlock(password);
		} catch {
			setError("Incorrect password.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="gateWrap">
			<section className="onboardingPanel gateCard">
				<div className="gateBrand">
					<Lock size={22} />
					<div>
						<p className="eyebrow">Aegis Wallet · Locked</p>
						<h2>{active?.label ?? "Unlock wallet"}</h2>
					</div>
				</div>
				{activeAddress && (
					<p className="gateLead">
						<code>{shortAddress(activeAddress)}</code>
					</p>
				)}

				<form
					className="formStack"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<label className="field">
						<span>Password</span>
						<input
							className="textInput"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							autoComplete="current-password"
						/>
					</label>

					{error && <p className="errorText">{error}</p>}

					<button className="primaryButton" type="submit" disabled={busy}>
						<Lock size={16} />
						{busy ? "Unlocking…" : "Unlock"}
					</button>
				</form>

				{activeAddress && (
					<button
						type="button"
						className="linkButton"
						onClick={() => {
							if (
								window.confirm(
									"Remove this account from this browser? Make sure you have its secret key backed up — this cannot be undone.",
								)
							) {
								removeAccount(activeAddress);
							}
						}}
					>
						Forget this account
					</button>
				)}
			</section>
		</div>
	);
};
