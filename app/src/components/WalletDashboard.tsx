"use client";

import { getSuiBalance } from "@aegis/shared";
import {
	Activity,
	Coins,
	Landmark,
	Lock,
	RefreshCw,
	Send,
	ShieldCheck,
	Wallet,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { formatSui, shortAddress } from "../lib/amounts";
import { useWalletAccount } from "../lib/wallet-account";
import {
	type LiveWalletSnapshot,
	loadLiveWalletSnapshot,
} from "../lib/wallet-snapshot";
import { AccountPanel } from "./AccountPanel";
import { BackupKeyScreen } from "./BackupKeyScreen";
import { Onboarding } from "./Onboarding";
import { ReceivePanel } from "./ReceivePanel";
import { SafetyDemoPanel } from "./SafetyDemoPanel";
import { SendModal } from "./SendModal";
import { StakeModal } from "./StakeModal";
import { UnlockScreen } from "./UnlockScreen";
import { VaultModePanel } from "./VaultModePanel";

type View = "wallet" | "security";

const Gate = ({ children }: { children: ReactNode }) => (
	<div className="gateWrap">
		<p className="gateLead">{children}</p>
	</div>
);

// Stable per-token color so the portfolio reads at a glance.
const badgeStyle = (symbol: string) => {
	let hue = 0;
	for (const char of symbol) {
		hue = (hue * 31 + char.charCodeAt(0)) % 360;
	}
	return {
		backgroundColor: `hsl(${hue} 45% 18%)`,
		color: `hsl(${hue} 70% 72%)`,
	};
};

// Tint an activity amount green (inbound) / red (outbound).
const valueTone = (value: string): string => {
	const trimmed = value.trim();
	if (trimmed.startsWith("-")) {
		return "out";
	}
	if (trimmed.startsWith("+")) {
		return "in";
	}
	return "";
};

const SecurityIntro = () => (
	<section className="introPanel">
		<div className="gateBrand">
			<ShieldCheck size={22} />
			<div>
				<p className="eyebrow">Security &amp; on-chain proof</p>
				<h2>Two layers between you and a drain</h2>
			</div>
		</div>
		<p className="introLead">
			Aegis pairs a transaction firewall that runs on every signature with an
			opt-in vault that needs a second, hardware-isolated approval. Both are
			verified against live Sui testnet — the digests below are real.
		</p>
		<div className="proofGrid">
			<div className="proofCard">
				<span className="tag live">Shipping core</span>
				<strong>Safe Wallet</strong>
				<p>
					Every send and stake is simulated, then risk-scanned for drainers,
					wallet sweeps, untrusted packages, and address poisoning before you
					can sign. Critical findings block the transaction.
				</p>
			</div>
			<div className="proofCard">
				<span className="tag testnet">Testnet-attested</span>
				<strong>Vault Mode</strong>
				<p>
					An optional 2-of-2 account: your passkey plus an AWS Nitro enclave
					co-signer that refuses any PTB violating policy. Drain-resistant under
					the Nitro + reproducible-build trust model — not provably
					un-drainable.
				</p>
			</div>
		</div>
	</section>
);

export const WalletDashboard = ({
	initialView = "wallet",
}: {
	initialView?: View;
}) => {
	const { status, activeAddress, activeAccount, accounts, network, lock } =
		useWalletAccount();
	const [view, setView] = useState<View>(initialView);
	const [suiMist, setSuiMist] = useState<bigint | null>(null);
	const [snapshot, setSnapshot] = useState<LiveWalletSnapshot | null>(null);
	const [snapError, setSnapError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [sendOpen, setSendOpen] = useState(false);
	const [stakeOpen, setStakeOpen] = useState(false);

	const refresh = useCallback(async () => {
		if (status !== "unlocked" || !activeAddress) {
			return;
		}
		setLoading(true);
		setSnapError(null);
		try {
			const balance = await getSuiBalance(activeAddress);
			setSuiMist(BigInt(balance.totalBalance));
		} catch {
			// keep the last known balance; the snapshot error below covers the UI
		}
		try {
			setSnapshot(await loadLiveWalletSnapshot(activeAddress));
		} catch {
			setSnapError("Live data is rate-limited right now — retry in a moment.");
		} finally {
			setLoading(false);
		}
	}, [status, activeAddress]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	if (status === "loading") {
		return <Gate>Loading wallet…</Gate>;
	}
	if (status === "empty") {
		return <Onboarding />;
	}
	if (status === "locked") {
		return <UnlockScreen />;
	}
	if (activeAccount && !activeAccount.backupConfirmed) {
		return <BackupKeyScreen />;
	}

	const address = activeAddress ?? "";
	const label =
		accounts.find((account) => account.address === address)?.label ?? "Account";

	return (
		<main className="shell">
			<aside className="rail" aria-label="Wallet navigation">
				<div className="mark">A</div>
				<button
					className={`railButton${view === "wallet" ? " active" : ""}`}
					type="button"
					aria-label="Wallet"
					aria-pressed={view === "wallet"}
					onClick={() => setView("wallet")}
				>
					<Wallet size={20} />
				</button>
				<button
					className={`railButton${view === "security" ? " active" : ""}`}
					type="button"
					aria-label="Security and proof"
					aria-pressed={view === "security"}
					onClick={() => setView("security")}
				>
					<ShieldCheck size={20} />
				</button>
				<a
					className="railButton"
					href="/activity"
					aria-label="Live decision log"
				>
					<Activity size={20} />
				</a>
				<button
					className="railButton railBottom"
					type="button"
					aria-label="Lock wallet"
					onClick={lock}
				>
					<Lock size={20} />
				</button>
			</aside>

			<section className="workspace">
				<header className="topbar">
					<div>
						<p className="eyebrow">Aegis · {network}</p>
						<h1>{suiMist !== null ? `${formatSui(suiMist)} SUI` : "—"}</h1>
						<p className="balanceSub">
							{snapshot ? snapshot.totalUsdValue : "—"} ·{" "}
							<code>{shortAddress(address)}</code> · {label}
						</p>
						<p className="heroTag">
							<ShieldCheck size={13} /> The Sui wallet with a bouncer — it won't
							let you get drained.
						</p>
					</div>
					<div className="actions">
						<button
							type="button"
							className="connectButton"
							onClick={() => void refresh()}
						>
							<RefreshCw size={16} /> {loading ? "Refreshing" : "Refresh"}
						</button>
						<button
							type="button"
							className="signButton sendButton"
							onClick={() => setSendOpen(true)}
							disabled={suiMist === null}
						>
							<Send size={16} /> Send
						</button>
						<button
							type="button"
							className="connectButton"
							onClick={() => setStakeOpen(true)}
							disabled={suiMist === null}
						>
							<Landmark size={16} /> Stake
						</button>
						<button type="button" className="rejectButton" onClick={lock}>
							<Lock size={16} /> Lock
						</button>
					</div>
				</header>

				{view === "wallet" ? (
					<>
						<div className="safetyBanner">
							<ShieldCheck size={16} />
							<strong>Testnet — no real funds.</strong> Every send is simulated
							and risk-scanned before you sign.
						</div>

						<div className="dashboardGrid">
							<SafetyDemoPanel />

							<section className="portfolioPanel">
								<div className="sectionHeader">
									<span>
										<Coins size={16} /> Portfolio
									</span>
									<strong>{snapshot?.portfolioRows.length ?? 0}</strong>
								</div>
								{snapError && (
									<p className="errorText">
										{snapError}{" "}
										<button
											type="button"
											className="linkButton"
											onClick={() => void refresh()}
										>
											Retry
										</button>
									</p>
								)}
								<div className="portfolioList">
									{snapshot?.portfolioRows.map((row, index) => (
										<div
											className="assetRow"
											// biome-ignore lint/suspicious/noArrayIndexKey: list is replaced wholesale on each refresh, so index is stable
											key={`${row.symbol}:${row.name}:${index}`}
										>
											<div
												className="assetBadge"
												style={badgeStyle(row.symbol)}
											>
												{row.symbol.slice(0, 3).toUpperCase()}
											</div>
											<div>
												<strong>{row.symbol}</strong>
												<span>{row.name}</span>
											</div>
											<div className="rowValue">
												<strong>{row.amount}</strong>
												<span>{row.value}</span>
											</div>
										</div>
									))}
									{!snapshot && !snapError && (
										<p className="muted">Loading live balances…</p>
									)}
									{snapshot && snapshot.portfolioRows.length === 0 && (
										<p className="muted">
											No tokens yet — use Receive to fund this address.
										</p>
									)}
								</div>
							</section>

							<ReceivePanel address={address} onFunded={() => void refresh()} />

							<section className="activityPanel">
								<div className="sectionHeader">
									<span>
										<Activity size={16} /> Activity
									</span>
									<strong>{snapshot?.activityRows.length ?? 0}</strong>
								</div>
								<div className="portfolioList">
									{snapshot?.activityRows.map((row) => (
										<div className="activityRow" key={row.id}>
											<div>
												<strong>{row.label}</strong>
												<span>{row.status}</span>
											</div>
											<div className={`rowValue ${valueTone(row.value)}`}>
												{row.value}
											</div>
										</div>
									))}
									{snapshot && snapshot.activityRows.length === 0 && (
										<p className="muted">No activity yet.</p>
									)}
								</div>
							</section>
						</div>
					</>
				) : (
					<div className="dashboardGrid secure">
						<SecurityIntro />
						<AccountPanel />
						<VaultModePanel />
					</div>
				)}
			</section>

			{sendOpen && suiMist !== null && (
				<SendModal
					address={address}
					suiMist={suiMist}
					onClose={() => setSendOpen(false)}
					onComplete={() => void refresh()}
				/>
			)}

			{stakeOpen && suiMist !== null && (
				<StakeModal
					address={address}
					suiMist={suiMist}
					onClose={() => setStakeOpen(false)}
					onComplete={() => void refresh()}
				/>
			)}
		</main>
	);
};
