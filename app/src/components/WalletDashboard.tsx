"use client";

import {
	ArrowDownToLine,
	BadgeCheck,
	Ban,
	Coins,
	Command,
	Eye,
	Fingerprint,
	Gem,
	KeyRound,
	Link2Off,
	Lock,
	QrCode,
	Radar,
	Repeat2,
	Send,
	Settings,
	ShieldAlert,
	ShieldCheck,
	Sparkles,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { buildCommandMenu } from "../lib/command-menu";
import {
	buildAdvancedTradingModel,
	buildBridgeModel,
	buildFiatOnrampModel,
	chainLabel,
} from "../lib/consumer-capabilities";
import {
	activityRows,
	defiRows,
	demoPreview,
	demoRecoverySetup,
	demoSimSummary,
	nftRows,
	notificationRows,
	permissionState,
	perSiteAccounts,
	policyReceiptRows,
	portfolioRows,
	subaccountRows,
	watchOnlyRows,
} from "../lib/demo-data";
import {
	buildNetworkSettingsModel,
	getNetworkSpendPolicy,
} from "../lib/network-settings";
import { enokiWalletProviders, getOnboardingStatus } from "../lib/onboarding";
import { disconnectSession, revokeCapability } from "../lib/permissions";
import { buildGuardianRecoveryPlan } from "../lib/recovery";
import {
	buildSecuritySettingsModel,
	getAutoLockState,
	getSecretExportPolicy,
} from "../lib/security-settings";
import {
	analyzeSimSummary,
	filterVisibleActivity,
	formatMist,
} from "../lib/transaction-analysis";
import { getVaultLivenessState } from "../lib/vault-liveness";
import {
	summarizeWalletParity,
	walletParityMatrix,
} from "../lib/wallet-parity";
import { buildSuiPayUri, getSendReadiness } from "../lib/wallet-workflows";

const analysis = analyzeSimSummary({
	walletAddress: demoPreview.walletAddress,
	totalMist: demoPreview.totalMist,
	summary: demoSimSummary,
	packagesTouched: demoPreview.effects.packagesTouched,
	policy: demoPreview.policy,
	addressBook: demoPreview.addressBook,
});
const visibleActivityRows = filterVisibleActivity(activityRows);
const onboardingStatus = getOnboardingStatus(
	process.env.NEXT_PUBLIC_ENOKI_API_KEY,
);
const vaultLiveness = getVaultLivenessState({
	enclaveReachable: false,
	recoveryRequestedAtMs: 1_000,
	timelockMs: 3_600_000,
	nowMs: 3_601_000,
});
const recoveryPlan = buildGuardianRecoveryPlan(demoRecoverySetup);
const commandMenu = buildCommandMenu({ activeAccountMode: "signing" });
const networkSettings = buildNetworkSettingsModel({
	activeNetwork: "testnet",
	allowMainnetSpend: process.env.AEGIS_ALLOW_MAINNET_SPEND === "true",
});
const mainnetSpendPolicy = getNetworkSpendPolicy(networkSettings, "mainnet");
const securitySettings = buildSecuritySettingsModel();
const autoLockState = getAutoLockState(securitySettings, {
	unlockedAtMs: 1_000,
	nowMs: 181_000,
});
const secretExportPolicy = getSecretExportPolicy(securitySettings);
const fiatOnrampModel = buildFiatOnrampModel({
	activeNetwork: "testnet",
	providerCredentialsReady: false,
});
const bridgeModel = buildBridgeModel({
	activeChain: "sui",
	providerRoutesReady: false,
});
const advancedTradingModel = buildAdvancedTradingModel({
	providerCredentialsReady: false,
	highRiskTradingEnabled: false,
});
const paritySummary = summarizeWalletParity();
const sendAmountMist = 250_000_000n;
const sendReadiness = getSendReadiness({
	balanceMist: demoPreview.totalMist,
	amountMist: sendAmountMist,
});
const receiveAddress =
	"0x89c2be87d2a3db2ad43f13a5b989868529c43f5d43ddad6ece3089f17df5338a";
const receiveUri = buildSuiPayUri({ address: receiveAddress });
const qrCells = Array.from({ length: 49 }, (_, index) => ({
	id: `qr-${index}`,
	on: index % 3 === 0 || index % 7 === 0,
}));

const riskLabel = {
	low: "Low",
	medium: "Medium",
	high: "High",
	critical: "Critical",
}[analysis.riskLevel];

export const WalletDashboard = () => {
	const [permissions, setPermissions] = useState(permissionState);

	return (
		<main className="shell">
			<aside className="rail" aria-label="Wallet navigation">
				<div className="mark">A</div>
				<button className="railButton active" type="button" aria-label="Wallet">
					<Wallet size={20} />
				</button>
				<button className="railButton" type="button" aria-label="Scanner">
					<Radar size={20} />
				</button>
				<button className="railButton" type="button" aria-label="Vault">
					<ShieldCheck size={20} />
				</button>
				<button className="railButton" type="button" aria-label="Recovery">
					<KeyRound size={20} />
				</button>
			</aside>

			<section className="workspace">
				<header className="topbar">
					<div>
						<p className="eyebrow">Aegis Safe Wallet</p>
						<h1>Sign with consequences visible.</h1>
					</div>
					<div className="actions">
						<button
							className="iconButton"
							type="button"
							aria-label="Command menu"
						>
							<Command size={18} />
						</button>
						<button className="connectButton" type="button">
							<Fingerprint size={18} />
							Passkey ready
						</button>
					</div>
				</header>

				<div className="dashboardGrid">
					<section className="portfolioPanel">
						<div className="sectionHeader">
							<span>Portfolio</span>
							<strong>$86,507</strong>
						</div>
						<div className="portfolioList">
							{portfolioRows.map((row) => (
								<div className="assetRow" key={row.symbol}>
									<div className={`assetBadge ${row.tone}`}>
										{row.symbol.slice(0, 1)}
									</div>
									<div>
										<strong>{row.symbol}</strong>
										<span>{row.name}</span>
									</div>
									<div className="rowValue">
										<strong>{row.value}</strong>
										<span>{row.amount}</span>
									</div>
								</div>
							))}
						</div>
					</section>

					<section className="toolsPanel">
						<button className="toolButton" type="button" aria-label="Send">
							<Send size={18} />
							<span>Send</span>
						</button>
						<button className="toolButton" type="button" aria-label="Receive">
							<ArrowDownToLine size={18} />
							<span>Receive</span>
						</button>
						<button className="toolButton" type="button" aria-label="Swap">
							<Repeat2 size={18} />
							<span>Swap</span>
						</button>
						<button className="toolButton" type="button" aria-label="Stake">
							<Coins size={18} />
							<span>Stake</span>
						</button>
						<div className={`toolStatus ${sendReadiness.status}`}>
							<strong>
								{sendReadiness.status === "ready"
									? `Ready to send ${formatMist(sendAmountMist)}`
									: sendReadiness.title}
							</strong>
							<span>
								{sendReadiness.status === "ready"
									? `Requires ${formatMist(sendReadiness.requiredMist)} including gas`
									: sendReadiness.detail}
							</span>
						</div>
					</section>

					<section className="commandPanel">
						<div className="sectionHeader compact">
							<span>Command menu</span>
							<Command size={18} />
						</div>
						<div className="commandList">
							{commandMenu.commands.slice(0, 6).map((command) => (
								<button className="commandRow" type="button" key={command.id}>
									<span>{command.label}</span>
									<em>{command.requiresSigning ? "Signs" : "View"}</em>
								</button>
							))}
						</div>
					</section>

					<section className="onboardingPanel">
						<div className="sectionHeader compact">
							<span>Onboarding</span>
							<Fingerprint size={18} />
						</div>
						<div className="policyStack">
							<div>
								<span>zkLogin providers</span>
								<strong>{enokiWalletProviders.join(" · ")}</strong>
							</div>
							<div>
								<span>Per-site accounts</span>
								<strong>{perSiteAccounts.length}</strong>
							</div>
							<div>
								<span>Sponsored gas</span>
								<strong
									className={
										onboardingStatus.sponsoredGas === "blocked"
											? "warnText"
											: ""
									}
								>
									{onboardingStatus.sponsoredGas}
								</strong>
							</div>
						</div>
					</section>

					<section className="networkPanel">
						<div className="sectionHeader compact">
							<span>Network settings</span>
							<Settings size={18} />
						</div>
						<div className="settingList">
							<div className="settingRow">
								<div>
									<strong>{networkSettings.activeNetwork.label}</strong>
									<span>{networkSettings.activeNetwork.rpcUrl}</span>
								</div>
								<em>Active</em>
							</div>
							{networkSettings.networks.map((network) => {
								const policy = getNetworkSpendPolicy(
									networkSettings,
									network.id,
								);
								return (
									<div className="settingRow" key={network.id}>
										<div>
											<strong>{network.label}</strong>
											<span>{policy.reason}</span>
										</div>
										<em className={policy.canSpend ? "" : "blocked"}>
											{policy.canSpend ? "Spend" : "Guarded"}
										</em>
									</div>
								);
							})}
							<div className="settingRow">
								<div>
									<strong>Mainnet approval</strong>
									<span>{mainnetSpendPolicy.reason}</span>
								</div>
								<em className={mainnetSpendPolicy.canSpend ? "" : "blocked"}>
									{mainnetSpendPolicy.canSpend ? "Enabled" : "Locked"}
								</em>
							</div>
						</div>
					</section>

					<section className="securityPanel">
						<div className="sectionHeader compact">
							<span>Security settings</span>
							<Lock size={18} />
						</div>
						<div className="settingList">
							<div className="settingRow">
								<div>
									<strong>Auto-lock</strong>
									<span>{securitySettings.autoLockMinutes} minutes</span>
								</div>
								<em>{autoLockState.locked ? "Locked" : "Open"}</em>
							</div>
							<div className="settingRow">
								<div>
									<strong>High-risk approvals</strong>
									<span>Biometric check before sign/recover/Vault edits</span>
								</div>
								<em>
									{securitySettings.requireBiometricForHighRisk ? "On" : "Off"}
								</em>
							</div>
							<div className="settingRow">
								<div>
									<strong>Simulation alerts</strong>
									<span>Pre-sign outflow, package, recipient warnings</span>
								</div>
								<em>
									{securitySettings.simulationAlertsEnabled ? "On" : "Off"}
								</em>
							</div>
							<div className="settingRow">
								<div>
									<strong>Privacy filters</strong>
									<span>Hide dust inbound and address-poisoning bait</span>
								</div>
								<em>{securitySettings.hideDustInbound ? "On" : "Off"}</em>
							</div>
							<div className="settingRow">
								<div>
									<strong>Seed export</strong>
									<span>{secretExportPolicy.reason}</span>
								</div>
								<em className={secretExportPolicy.allowed ? "" : "blocked"}>
									{secretExportPolicy.allowed ? "Allowed" : "Disabled"}
								</em>
							</div>
						</div>
					</section>

					<section className="consumerPanel">
						<div className="sectionHeader compact">
							<span>Fiat on-ramp</span>
							<Coins size={18} />
						</div>
						<div className="settingList">
							<div className="settingRow">
								<div>
									<strong>Provider KYC handoff</strong>
									<span>{fiatOnrampModel.reason}</span>
								</div>
								<em
									className={
										fiatOnrampModel.status === "ready" ? "" : "blocked"
									}
								>
									{fiatOnrampModel.status}
								</em>
							</div>
							{fiatOnrampModel.providers.map((provider) => (
								<div className="settingRow" key={provider.id}>
									<div>
										<strong>{provider.label}</strong>
										<span>{provider.supports.join(" / ")} · KYC required</span>
									</div>
									<em className={provider.status === "ready" ? "" : "blocked"}>
										{provider.status}
									</em>
								</div>
							))}
						</div>
					</section>

					<section className="bridgePanel">
						<div className="sectionHeader compact">
							<span>Bridge routes</span>
							<Repeat2 size={18} />
						</div>
						<div className="settingList">
							<div className="settingRow">
								<div>
									<strong>Provider routing</strong>
									<span>{bridgeModel.reason}</span>
								</div>
								<em className={bridgeModel.status === "ready" ? "" : "blocked"}>
									{bridgeModel.status}
								</em>
							</div>
							{bridgeModel.routes.slice(0, 3).map((route) => (
								<div
									className="settingRow"
									key={`${route.fromChain}-${route.toChain}`}
								>
									<div>
										<strong>
											{chainLabel(route.fromChain)} to{" "}
											{chainLabel(route.toChain)}
										</strong>
										<span>{route.providers.join(" / ")}</span>
									</div>
									<em className={route.status === "ready" ? "" : "blocked"}>
										{route.status}
									</em>
								</div>
							))}
						</div>
					</section>

					<section className="advancedPanel">
						<div className="sectionHeader compact">
							<span>Advanced trading</span>
							<Sparkles size={18} />
						</div>
						<div className="settingList">
							<div className="settingRow">
								<div>
									<strong>High-risk mode</strong>
									<span>{advancedTradingModel.reason}</span>
								</div>
								<em
									className={
										advancedTradingModel.status === "ready" ? "" : "blocked"
									}
								>
									{advancedTradingModel.status}
								</em>
							</div>
							{advancedTradingModel.items.slice(0, 4).map((item) => (
								<div className="settingRow" key={item.id}>
									<div>
										<strong>{item.label}</strong>
										<span>
											{item.requiresHighRiskApproval
												? "Explicit high-risk approval"
												: "Provider-gated"}
										</span>
									</div>
									<em className={item.status === "ready" ? "" : "blocked"}>
										{item.status}
									</em>
								</div>
							))}
						</div>
					</section>

					<section className="parityPanel" aria-label="Wallet feature parity">
						<div className="sectionHeader compact">
							<span>Wallet parity</span>
							<BadgeCheck size={18} />
						</div>
						<div className="paritySummary">
							<div>
								<strong>{paritySummary.implemented}</strong>
								<span>Implemented</span>
							</div>
							<div>
								<strong>{paritySummary.gated}</strong>
								<span>Gated</span>
							</div>
							<div>
								<strong>{paritySummary.planned}</strong>
								<span>Planned</span>
							</div>
						</div>
						<div className="parityList">
							{walletParityMatrix.map((row) => (
								<div className="parityRow" key={row.id}>
									<div>
										<strong>{row.capability}</strong>
										<span>
											{row.category} · {row.aegisEvidence}
										</span>
									</div>
									<em className={row.aegisStatus}>{row.aegisStatus}</em>
								</div>
							))}
						</div>
					</section>

					<section className="signingPanel">
						<div className="signingTitle">
							<div>
								<p className="eyebrow">Simulation</p>
								<h2>{analysis.summary}</h2>
							</div>
							<div className={`riskPill ${analysis.riskLevel}`}>
								<ShieldAlert size={18} />
								{riskLabel}
							</div>
						</div>

						<div className="flowStrip">
							<div>
								<span>From</span>
								<strong>0xaeg1...0001</strong>
							</div>
							<div className="flowLine" />
							<div>
								<span>To</span>
								<strong>0x7afe...beef</strong>
							</div>
						</div>

						<div className="deltaGrid">
							<div className="deltaBox danger">
								<span>Net SUI</span>
								<strong>{formatMist(analysis.netMist)}</strong>
							</div>
							<div className="deltaBox">
								<span>Objects leaving</span>
								<strong>{analysis.netObjects.length}</strong>
							</div>
							<div className="deltaBox">
								<span>Packages touched</span>
								<strong>{demoPreview.effects.packagesTouched.length}</strong>
							</div>
							<div className="deltaBox">
								<span>Gas</span>
								<strong>{formatMist(analysis.gasMist)}</strong>
							</div>
						</div>

						{analysis.failed ? (
							<div className="simulationError">
								<strong>{analysis.failed.title}</strong>
								<span>{analysis.failed.detail}</span>
							</div>
						) : null}

						<div className="findingList">
							{analysis.findings.map((finding) => (
								<div
									className="findingRow"
									key={`${finding.kind}-${finding.title}`}
								>
									<Ban size={18} />
									<div>
										<strong>{finding.title}</strong>
										<span>{finding.detail}</span>
									</div>
								</div>
							))}
						</div>

						<div className="signingActions">
							<button className="rejectButton" type="button">
								Reject
							</button>
							<button className="signButton" type="button">
								Sign anyway
							</button>
						</div>
					</section>

					<section className="permissionsPanel">
						<div className="sectionHeader">
							<span>dApp sessions</span>
							<Link2Off size={18} />
						</div>
						<div className="permissionList">
							{permissions.sessions.map((session) => (
								<div className="permissionRow" key={session.id}>
									<div>
										<strong>{session.origin}</strong>
										<span>
											{session.account} · {session.connectedAt}
										</span>
									</div>
									<button
										className="miniButton"
										type="button"
										disabled={!session.active}
										onClick={() =>
											setPermissions((state) =>
												disconnectSession(state, session.id),
											)
										}
									>
										{session.active ? "Disconnect" : "Off"}
									</button>
								</div>
							))}
						</div>
						<div className="sectionHeader compact secondary">
							<span>Capability objects</span>
							<BadgeCheck size={18} />
						</div>
						<div className="permissionList">
							{permissions.capabilities.map((capability) => (
								<div className="permissionRow" key={capability.objectId}>
									<div>
										<strong>{capability.label}</strong>
										<span>
											{capability.objectId} ·{" "}
											{capability.expiresAt ?? "no expiry"}
										</span>
									</div>
									<button
										className="miniButton"
										type="button"
										disabled={capability.revoked}
										onClick={() =>
											setPermissions((state) =>
												revokeCapability(state, capability.objectId),
											)
										}
									>
										{capability.revoked ? "Revoked" : "Revoke"}
									</button>
								</div>
							))}
						</div>
						<div className="sectionHeader compact secondary">
							<span>Sub-accounts</span>
							<KeyRound size={18} />
						</div>
						<div className="permissionList">
							{subaccountRows.map((subaccount) => (
								<div className="permissionRow" key={subaccount.id}>
									<div>
										<strong>{subaccount.dapp}</strong>
										<span>
											{formatMist(subaccount.spentMist)} /{" "}
											{formatMist(subaccount.maxMist)}
										</span>
									</div>
									<em className={subaccount.revoked ? "blocked" : ""}>
										{subaccount.revoked ? "Revoked" : "Active"}
									</em>
								</div>
							))}
						</div>
						<div className="sectionHeader compact secondary">
							<span>Watch-only</span>
							<Eye size={18} />
						</div>
						<div className="permissionList">
							{watchOnlyRows.map((account) => (
								<div className="permissionRow" key={account.address}>
									<div>
										<strong>{account.label}</strong>
										<span>
											{account.address.slice(0, 10)}...
											{account.address.slice(-8)} · {account.source}
										</span>
									</div>
									<em className="blocked">No signing</em>
								</div>
							))}
						</div>
					</section>

					<section className="vaultPanel">
						<div className="sectionHeader compact">
							<span>Vault Mode</span>
							<BadgeCheck size={18} />
						</div>
						<div className="vaultMeter">
							<ShieldCheck size={34} />
							<strong>TEE co-signer spike</strong>
							<span>
								Policy engine boundary ready for Nautilus attestation proof.
							</span>
						</div>
						<div className="policyStack">
							<div>
								<span>Max outflow</span>
								<strong>25%</strong>
							</div>
							<div>
								<span>Recipient rule</span>
								<strong>Allowlist</strong>
							</div>
							<div>
								<span>Escape path</span>
								<strong>{vaultLiveness.status}</strong>
							</div>
						</div>
						<div className="sectionHeader compact secondary">
							<span>Policy receipts</span>
							<ShieldCheck size={18} />
						</div>
						<div className="receiptList">
							{policyReceiptRows.map((receipt) => (
								<div className="receiptRow" key={receipt.digest}>
									<strong
										className={receipt.status === "rejected" ? "blocked" : ""}
									>
										{receipt.status}
									</strong>
									<span>{receipt.reason}</span>
									<code>{receipt.digest.slice(0, 10)}...</code>
								</div>
							))}
						</div>
					</section>

					<section className="recoveryPanel">
						<div className="sectionHeader compact">
							<span>Recovery</span>
							<KeyRound size={18} />
						</div>
						<div className="vaultMeter">
							<KeyRound size={34} />
							<strong>{recoveryPlan.status}</strong>
							<span>
								{recoveryPlan.shamirLabel} · {recoveryPlan.sealLabel}
							</span>
						</div>
						<div className="shareList">
							{recoveryPlan.shareRows.map((share) => (
								<div className="shareRow" key={share.identity}>
									<div>
										<strong>{share.guardian}</strong>
										<code>
											{share.identity.slice(0, 10)}...
											{share.identity.slice(-8)}
										</code>
									</div>
									<em className={share.encrypted ? "" : "blocked"}>
										{share.encrypted ? "Encrypted" : "Missing"}
									</em>
								</div>
							))}
						</div>
					</section>

					<section className="galleryPanel">
						<div className="sectionHeader compact">
							<span>NFT gallery</span>
							<Gem size={18} />
						</div>
						<div className="nftGrid">
							{nftRows.map((nft) => (
								<div className={`nftTile ${nft.tone}`} key={nft.name}>
									<strong>{nft.name}</strong>
									<span>{nft.collection}</span>
								</div>
							))}
						</div>
					</section>

					<section className="defiPanel">
						<div className="sectionHeader compact">
							<span>DeFi positions</span>
							<Coins size={18} />
						</div>
						<div className="policyStack">
							{defiRows.map((row) => (
								<div key={row.protocol}>
									<span>
										{row.protocol} · {row.label}
									</span>
									<strong>{row.value}</strong>
								</div>
							))}
						</div>
					</section>

					<section className="receivePanel">
						<div className="sectionHeader compact">
							<span>Receive</span>
							<QrCode size={18} />
						</div>
						<div className="qrBlock" role="img" aria-label="Receive QR preview">
							{qrCells.map((cell) => (
								<i key={cell.id} className={cell.on ? "on" : ""} />
							))}
						</div>
						<code>{receiveUri}</code>
						<button
							className="qrScanButton"
							type="button"
							aria-label="Scan recipient QR"
						>
							<QrCode size={16} />
							<span>Scan QR</span>
						</button>
					</section>

					<section className="notificationsPanel">
						<div className="sectionHeader compact">
							<span>Notifications</span>
							<Sparkles size={18} />
						</div>
						<div className="receiptList">
							{notificationRows.map((notification) => (
								<div className="receiptRow" key={notification.id}>
									<strong>{notification.title}</strong>
									<span>{notification.detail}</span>
								</div>
							))}
						</div>
					</section>

					<section className="activityPanel">
						<div className="sectionHeader">
							<span>Activity</span>
							<Sparkles size={18} />
						</div>
						{visibleActivityRows.map((row) => (
							<div className="activityRow" key={row.label}>
								<div>
									<strong>{row.label}</strong>
									<span>{row.value}</span>
								</div>
								<em className={row.status === "Blocked" ? "blocked" : ""}>
									{row.status}
								</em>
							</div>
						))}
					</section>
				</div>
			</section>
		</main>
	);
};
