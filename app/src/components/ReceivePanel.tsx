"use client";

import { Copy, Droplets, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { requestTestnetFaucet } from "../lib/faucet";
import { createReceiveQrSvg } from "../lib/wallet-workflows";

export const ReceivePanel = ({
	address,
	onFunded,
}: {
	address: string;
	onFunded: () => void;
}) => {
	const [svg, setSvg] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [faucetState, setFaucetState] = useState<
		"idle" | "requesting" | "sent" | "error"
	>("idle");

	useEffect(() => {
		let active = true;
		createReceiveQrSvg({ address })
			.then((result) => {
				if (active) {
					setSvg(result.svg);
				}
			})
			.catch(() => {
				if (active) {
					setSvg(null);
				}
			});
		return () => {
			active = false;
		};
	}, [address]);

	const copy = async () => {
		await navigator.clipboard.writeText(address);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const faucet = async () => {
		setFaucetState("requesting");
		try {
			await requestTestnetFaucet(address);
			setFaucetState("sent");
			setTimeout(onFunded, 2500);
		} catch {
			setFaucetState("error");
		}
	};

	return (
		<section className="receivePanel">
			<div className="sectionHeader">
				<span>
					<QrCode size={16} /> Receive
				</span>
				<strong>Fund</strong>
			</div>

			{svg ? (
				// QR SVG generated from the canonical sui://pay payload for this address.
				<div
					className="qrSvg"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted locally generated QR SVG
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
			) : (
				<div className="qrSvg qrPlaceholder" />
			)}

			<code>{address}</code>

			<button
				type="button"
				className="qrScanButton"
				onClick={() => void copy()}
			>
				<Copy size={15} /> {copied ? "Copied" : "Copy address"}
			</button>

			<button
				type="button"
				className="qrScanButton"
				disabled={faucetState === "requesting" || faucetState === "sent"}
				onClick={() => void faucet()}
			>
				<Droplets size={15} />
				{faucetState === "requesting"
					? "Requesting…"
					: faucetState === "sent"
						? "Faucet sent — refreshing"
						: faucetState === "error"
							? "Faucet busy, try again"
							: "Request testnet SUI"}
			</button>
		</section>
	);
};
