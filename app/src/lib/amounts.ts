const MIST_PER_SUI = 1_000_000_000n;

/** Parse a human SUI amount (e.g. "1.25") into MIST. Throws on malformed input. */
export const parseSuiToMist = (input: string): bigint => {
	const trimmed = input.trim();
	if (!/^\d*(\.\d{0,9})?$/.test(trimmed) || trimmed === "" || trimmed === ".") {
		throw new Error("enter a valid SUI amount (up to 9 decimals)");
	}

	const [whole, fraction = ""] = trimmed.split(".");
	const paddedFraction = fraction.padEnd(9, "0");
	return BigInt(whole || "0") * MIST_PER_SUI + BigInt(paddedFraction || "0");
};

export const formatSui = (mist: bigint, maxDecimals = 4): string => {
	const negative = mist < 0n;
	const abs = negative ? -mist : mist;
	const whole = abs / MIST_PER_SUI;
	const fraction = (abs % MIST_PER_SUI).toString().padStart(9, "0");
	const trimmed = fraction.slice(0, maxDecimals).replace(/0+$/, "");
	return `${negative ? "-" : ""}${whole.toString()}${trimmed ? `.${trimmed}` : ""}`;
};

export const shortAddress = (address: string): string =>
	address.length > 13 ? `${address.slice(0, 7)}…${address.slice(-5)}` : address;
