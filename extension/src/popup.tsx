import { type ReactNode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { PendingPreview } from "./background";
import type { RuntimeMessage, WalletAccountInfo } from "./messaging";

type State = {
	hasAccounts: boolean;
	locked: boolean;
	accounts: WalletAccountInfo[];
};

const send = <T,>(message: RuntimeMessage): Promise<T> =>
	chrome.runtime.sendMessage(message);

const MIST = 1_000_000_000n;
const formatSui = (raw: string): string => {
	const value = BigInt(raw || "0");
	const sign = value < 0n ? "-" : "";
	const abs = value < 0n ? -value : value;
	const whole = abs / MIST;
	const frac = (abs % MIST)
		.toString()
		.padStart(9, "0")
		.slice(0, 4)
		.replace(/0+$/, "");
	return `${sign}${whole}${frac ? `.${frac}` : ""} SUI`;
};
const short = (address: string): string =>
	address.length > 13 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address;

const Field = ({
	label,
	value,
	onChange,
	type = "text",
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
}) => (
	<label className="field">
		<span>{label}</span>
		<input
			className="input"
			type={type}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			autoComplete="off"
		/>
	</label>
);

const Onboard = ({ onDone }: { onDone: () => void }) => {
	const [mode, setMode] = useState<"create" | "import">("create");
	const [label, setLabel] = useState("Main account");
	const [secretKey, setSecretKey] = useState("");
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		setError(null);
		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}
		setBusy(true);
		const result = await send<{ error?: string }>(
			mode === "create"
				? { type: "popup:create", label, password }
				: { type: "popup:import", label, secretKey, password },
		);
		setBusy(false);
		if (result?.error) {
			setError(result.error);
		} else {
			onDone();
		}
	};

	return (
		<div className="card">
			<h1>Set up Aegis</h1>
			<p className="lead">
				A self-custody Sui wallet with a safety check on every transaction. Your
				key is encrypted and stored only in this browser. Testnet, hot key.
			</p>
			<div className="seg">
				<button
					type="button"
					className={mode === "create" ? "on" : ""}
					onClick={() => setMode("create")}
				>
					Create
				</button>
				<button
					type="button"
					className={mode === "import" ? "on" : ""}
					onClick={() => setMode("import")}
				>
					Import
				</button>
			</div>
			<Field label="Label" value={label} onChange={setLabel} />
			{mode === "import" && (
				<Field
					label="Secret key (suiprivkey…)"
					value={secretKey}
					onChange={setSecretKey}
				/>
			)}
			<Field
				label="Password"
				value={password}
				onChange={setPassword}
				type="password"
			/>
			{error && <p className="err">{error}</p>}
			<button
				type="button"
				className="primary"
				disabled={busy}
				onClick={() => void submit()}
			>
				{busy
					? "Working…"
					: mode === "create"
						? "Create wallet"
						: "Import wallet"}
			</button>
		</div>
	);
};

const Unlock = ({ onDone }: { onDone: () => void }) => {
	const [password, setPassword] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		setError(null);
		setBusy(true);
		const result = await send<{ error?: string }>({
			type: "popup:unlock",
			password,
		});
		setBusy(false);
		if (result?.error) {
			setError("Incorrect password.");
		} else {
			onDone();
		}
	};

	return (
		<div className="card">
			<h1>Unlock Aegis</h1>
			<Field
				label="Password"
				value={password}
				onChange={setPassword}
				type="password"
			/>
			{error && <p className="err">{error}</p>}
			<button
				type="button"
				className="primary"
				disabled={busy}
				onClick={() => void submit()}
			>
				{busy ? "Unlocking…" : "Unlock"}
			</button>
		</div>
	);
};

const AccountView = ({
	state,
	refresh,
}: {
	state: State;
	refresh: () => void;
}) => (
	<div className="card">
		<h1>Aegis · Testnet</h1>
		{state.accounts.map((account) => (
			<div className="row" key={account.address}>
				<strong>{account.label}</strong>
				<code>{short(account.address)}</code>
			</div>
		))}
		<button
			type="button"
			className="ghost"
			onClick={() => send({ type: "popup:lock" }).then(refresh)}
		>
			Lock wallet
		</button>
		<p className="lead">Connect to a Sui dApp and approve transactions here.</p>
	</div>
);

const Approval = ({
	requestId,
	preview,
	state,
	refresh,
}: {
	requestId: string;
	preview: PendingPreview;
	state: State;
	refresh: () => void;
}) => {
	const resolve = (approved: boolean) =>
		send({ type: "popup:resolve", id: requestId, approved }).then(() =>
			window.close(),
		);

	if (!state.hasAccounts) {
		return <Onboard onDone={refresh} />;
	}
	if (state.locked) {
		return <Unlock onDone={refresh} />;
	}

	const risk = preview.assessment;
	const blocked = risk?.riskLevel === "critical";
	const isSign = preview.method !== "connect";

	return (
		<div className="card">
			<p className="origin">{preview.origin}</p>
			<h1>
				{preview.method === "connect"
					? "Connect to Aegis"
					: preview.method === "signPersonalMessage"
						? "Sign message"
						: "Approve transaction"}
			</h1>

			{preview.method === "connect" && (
				<p className="lead">
					This site wants to view your accounts and request approvals. Signing
					always happens here, with a safety check.
				</p>
			)}

			{preview.message !== undefined && (
				<pre className="message">{preview.message}</pre>
			)}

			{isSign && risk && preview.sim && (
				<>
					<div className={`pill ${risk.riskLevel}`}>Risk: {risk.riskLevel}</div>

					{preview.ai ? (
						<div className={`aiBlock ${preview.ai.riskLevel}`}>
							<span className="aiTag">Aegis AI analysis</span>
							<strong>{preview.ai.headline}</strong>
							<p>{preview.ai.explanation}</p>
							{preview.ai.findings.map((finding) => (
								<div className="aiFinding" key={finding.title}>
									<strong>{finding.title}</strong>
									<span>{finding.detail}</span>
								</div>
							))}
						</div>
					) : preview.aiUnavailable ? (
						<div className="aiBlock offline">
							<span className="aiTag">AI offline</span>
							Using on-device rules only. Start the Aegis risk service to enable
							AI analysis.
						</div>
					) : null}

					<div className="grid">
						<div>
							<span>You send</span>
							<strong>{formatSui(`-${risk.netOutMist}`)}</strong>
						</div>
						<div>
							<span>Est. gas</span>
							<strong>{formatSui(risk.gasMist)}</strong>
						</div>
						<div>
							<span>Objects leaving</span>
							<strong>{risk.objectsLeaving}</strong>
						</div>
					</div>
					{risk.findings.map((finding) => (
						<div className="finding" key={finding.title}>
							<strong>{finding.title}</strong>
							<span>{finding.detail}</span>
						</div>
					))}
				</>
			)}

			<div className="actions">
				<button type="button" className="ghost" onClick={() => resolve(false)}>
					Reject
				</button>
				<button
					type="button"
					className="primary"
					disabled={blocked}
					onClick={() => resolve(true)}
				>
					{blocked
						? "Blocked — critical"
						: preview.method === "connect"
							? "Connect"
							: "Approve"}
				</button>
			</div>
		</div>
	);
};

const App = () => {
	const requestId = new URLSearchParams(window.location.search).get("request");
	const [state, setState] = useState<State | null>(null);
	const [pending, setPending] = useState<PendingPreview | null | undefined>(
		undefined,
	);

	const refresh = () => send<State>({ type: "popup:state" }).then(setState);

	useEffect(() => {
		send<State>({ type: "popup:state" }).then(setState);
		if (requestId) {
			send<PendingPreview | null>({
				type: "popup:get-pending",
				id: requestId,
			}).then(setPending);
		}
	}, [requestId]);

	if (!state) {
		return <div className="card">Loading…</div>;
	}

	let body: ReactNode;
	if (requestId) {
		if (pending === undefined) {
			body = <div className="card">Loading…</div>;
		} else if (pending === null) {
			body = <div className="card">This request has expired.</div>;
		} else {
			body = (
				<Approval
					requestId={requestId}
					preview={pending}
					state={state}
					refresh={refresh}
				/>
			);
		}
	} else if (!state.hasAccounts) {
		body = <Onboard onDone={refresh} />;
	} else if (state.locked) {
		body = <Unlock onDone={refresh} />;
	} else {
		body = <AccountView state={state} refresh={refresh} />;
	}

	return body;
};

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(<App />);
}
