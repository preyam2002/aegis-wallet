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
import { Onboarding } from "./Onboarding";
import { ReceivePanel } from "./ReceivePanel";
import { SendModal } from "./SendModal";
import { StakeModal } from "./StakeModal";
import { UnlockScreen } from "./UnlockScreen";

const Gate = ({ children }: { children: ReactNode }) => (
	<div className="gateWrap">
		<p className="gateLead">{children}</p>
	</div>
);

export const WalletDashboard = () => {
	const { status, activeAddress, accounts, network, lock } = useWalletAccount();
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

	const address = activeAddress ?? "";
	const label =
		accounts.find((account) => account.address === address)?.label ?? "Account";

	return (
		<main className="shell">
			<aside className="rail" aria-label="Wallet navigation">
				<div className="mark">A</div>
				<button className="railButton active" type="button" aria-label="Wallet">
					<Wallet size={20} />
				</button>
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

				<div className="safetyBanner">
					<ShieldCheck size={16} /> Every send is simulated and risk-scanned
					before you sign.
				</div>

				<div className="dashboardGrid">
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
							{snapshot?.portfolioRows.map((row) => (
								<div className="assetRow" key={`${row.symbol}:${row.name}`}>
									<div className="assetBadge ink">
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
									<div className="rowValue">{row.value}</div>
								</div>
							))}
							{snapshot && snapshot.activityRows.length === 0 && (
								<p className="muted">No activity yet.</p>
							)}
						</div>
					</section>
				</div>
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
