"use client";

import { KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { useWalletAccount } from "../lib/wallet-account";

const enokiConfigured = Boolean(
	process.env.NEXT_PUBLIC_ENOKI_API_KEY &&
		process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
);

type Mode = "create" | "import";

export const Onboarding = () => {
	const { createAccount, importAccount } = useWalletAccount();
	const [mode, setMode] = useState<Mode>("create");
	const [label, setLabel] = useState("Main account");
	const [secretKey, setSecretKey] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		setError(null);
		if (password.length < 8) {
			setError("Use a password of at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Passwords do not match.");
			return;
		}

		setBusy(true);
		try {
			if (mode === "create") {
				await createAccount({ label: label || "Main account", password });
			} else {
				await importAccount({
					label: label || "Imported account",
					secretKey,
					password,
				});
			}
		} catch (cause) {
			setError(
				mode === "import"
					? "Could not import that secret key. Expected a suiprivkey… value."
					: `Could not create the account: ${String(cause)}`,
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="gateWrap">
			<section className="onboardingPanel gateCard">
				<div className="gateBrand">
					<ShieldCheck size={22} />
					<div>
						<p className="eyebrow">Aegis Wallet · Testnet</p>
						<h2>Set up your wallet</h2>
					</div>
				</div>
				<p className="gateLead">
					Self-custody Sui wallet with a safety layer on every transaction. Your
					key is encrypted with this password and stored only in this browser.
				</p>
				<p className="backupNotice">
					Back up before funding. Aegis will show the secret key and require a
					backup confirmation before the dashboard opens.
				</p>

				<div className="segmented" role="tablist">
					<button
						type="button"
						role="tab"
						aria-selected={mode === "create"}
						className={mode === "create" ? "segActive" : ""}
						onClick={() => setMode("create")}
					>
						Create new
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "import"}
						className={mode === "import" ? "segActive" : ""}
						onClick={() => setMode("import")}
					>
						Import key
					</button>
				</div>

				<form
					className="formStack"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<label className="field">
						<span>Account label</span>
						<input
							className="textInput"
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							placeholder="Main account"
						/>
					</label>

					{mode === "import" && (
						<label className="field">
							<span>Secret key</span>
							<input
								className="textInput"
								value={secretKey}
								onChange={(event) => setSecretKey(event.target.value)}
								placeholder="suiprivkey1…"
								autoComplete="off"
								spellCheck={false}
							/>
						</label>
					)}

					<label className="field">
						<span>Password</span>
						<input
							className="textInput"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							placeholder="At least 8 characters"
							autoComplete="new-password"
						/>
					</label>

					<label className="field">
						<span>Confirm password</span>
						<input
							className="textInput"
							type="password"
							value={confirm}
							onChange={(event) => setConfirm(event.target.value)}
							autoComplete="new-password"
						/>
					</label>

					{error && <p className="errorText">{error}</p>}

					<button className="primaryButton" type="submit" disabled={busy}>
						<KeyRound size={16} />
						{busy
							? "Working…"
							: mode === "create"
								? "Create wallet"
								: "Import wallet"}
					</button>
				</form>

				<div className="gateDivider">
					<span>or</span>
				</div>

				<button
					type="button"
					className="primaryButton ghost"
					disabled={!enokiConfigured}
					title={
						enokiConfigured
							? "Continue with Google (zkLogin)"
							: "Set NEXT_PUBLIC_ENOKI_API_KEY and NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable zkLogin"
					}
				>
					<Sparkles size={16} />
					{enokiConfigured
						? "Continue with Google"
						: "Continue with Google — configure Enoki to enable"}
				</button>

				<p className="gateNote">
					Hot key, testnet only. Don't store mainnet funds here without a
					hardware or passkey signer.
				</p>
			</section>
		</div>
	);
};
