"use client";

import { Copy, KeyRound, Settings } from "lucide-react";
import { useState } from "react";
import { loadAddressBook, loadKnownRecipients } from "../lib/address-book";
import { shortAddress } from "../lib/amounts";
import { useWalletAccount } from "../lib/wallet-account";

export const AccountPanel = () => {
	const {
		activeAddress,
		activeAccount,
		accounts,
		network,
		exportActiveSecret,
	} = useWalletAccount();
	const [password, setPassword] = useState("");
	const [secretKey, setSecretKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const addressBookCount = loadAddressBook().length;
	const knownRecipientCount = loadKnownRecipients().length;

	const reveal = async () => {
		setError(null);
		try {
			setSecretKey(await exportActiveSecret(password));
		} catch {
			setSecretKey(null);
			setError("Incorrect password.");
		}
	};

	const copy = async () => {
		if (!secretKey) {
			return;
		}
		await navigator.clipboard.writeText(secretKey);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<section className="accountPanel">
			<div className="sectionHeader">
				<span>
					<Settings size={16} /> Account settings
				</span>
				<strong>{accounts.length}</strong>
			</div>

			<div className="settingList">
				<div className="settingRow">
					<div>
						<strong>{activeAccount?.label ?? "Account"}</strong>
						<span>{activeAddress ?? "No active address"}</span>
					</div>
					<em>{activeAddress ? shortAddress(activeAddress) : "none"}</em>
				</div>
				<div className="settingRow">
					<div>
						<strong>Testnet — no real funds</strong>
						<span>Network is fixed to Sui testnet in this build.</span>
					</div>
					<em>{network}</em>
				</div>
				<div className="settingRow">
					<div>
						<strong>Backup</strong>
						<span>
							{activeAccount?.backupConfirmed
								? "Secret key backup confirmed."
								: "Backup still required before funding."}
						</span>
					</div>
					<em className={activeAccount?.backupConfirmed ? "" : "blocked"}>
						{activeAccount?.backupConfirmed ? "saved" : "required"}
					</em>
				</div>
				<div className="settingRow">
					<div>
						<strong>Trusted recipients</strong>
						<span>
							{knownRecipientCount} learned sends · {addressBookCount} labeled
							contacts
						</span>
					</div>
					<em>{knownRecipientCount + addressBookCount}</em>
				</div>
			</div>

			<form
				className="formStack exportForm"
				onSubmit={(event) => {
					event.preventDefault();
					void reveal();
				}}
			>
				<label className="field">
					<span>Export secret key</span>
					<input
						className="textInput"
						type="password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="Wallet password"
						autoComplete="current-password"
					/>
				</label>
				{error && <p className="errorText">{error}</p>}
				<button className="primaryButton ghost" type="submit">
					<KeyRound size={16} />
					Reveal export
				</button>
			</form>

			{secretKey && (
				<div className="secretBox exportBox">
					<span>Secret key · hover to reveal</span>
					<code>{secretKey}</code>
					<button
						type="button"
						className="qrScanButton"
						onClick={() => void copy()}
					>
						<Copy size={15} />
						{copied ? "Copied" : "Copy export"}
					</button>
				</div>
			)}
		</section>
	);
};
