// A real Sui Wallet Standard dApp used to demo the Aegis extension's bouncer.
// It finds the Aegis wallet via the standard registry, connects, and proposes
// two transactions: a benign 0.01 SUI send (the popup green-approves) and a
// drain that sends ~95% of the wallet's SUI (the popup blocks it as critical).
// Nothing is staged: these are real PTBs the extension really simulates.
import { Transaction } from "@mysten/sui/transactions";
import { getWallets } from "@mysten/wallet-standard";

const TESTNET = "sui:testnet";
const DRAIN_RECIPIENT =
	"0x000000000000000000000000000000000000000000000000000000000000dead";
const FULLNODE = "https://fullnode.testnet.sui.io:443";

type StandardWallet = ReturnType<ReturnType<typeof getWallets>["get"]>[number];

let aegis: StandardWallet | null = null;
// biome-ignore lint/suspicious/noExplicitAny: wallet-standard account shape
let account: any = null;

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (msg: string, tone: "" | "ok" | "bad" = "") => {
	const line = document.createElement("div");
	line.className = `logLine ${tone}`;
	line.textContent = msg;
	$("log").prepend(line);
};

const findAegis = (): StandardWallet | null => {
	for (const wallet of getWallets().get()) {
		if (wallet.name === "Aegis") {
			return wallet;
		}
	}
	return null;
};

const setConnected = (connected: boolean) => {
	$("sendBtn").toggleAttribute("disabled", !connected);
	$("drainBtn").toggleAttribute("disabled", !connected);
	$("connectBtn").textContent = connected ? "Connected" : "Connect Aegis";
	$("connectBtn").toggleAttribute("disabled", connected);
};

const getBalance = async (owner: string): Promise<bigint> => {
	const res = await fetch(FULLNODE, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "suix_getBalance",
			params: [owner],
		}),
	});
	const body = await res.json();
	return BigInt(body.result.totalBalance);
};

const signAndExecute = async (tx: Transaction) => {
	if (!aegis || !account) {
		throw new Error("Connect Aegis first.");
	}
	const feature = aegis.features[
		"sui:signAndExecuteTransaction"
		// biome-ignore lint/suspicious/noExplicitAny: wallet-standard feature shape
	] as any;
	return feature.signAndExecuteTransaction({
		transaction: tx,
		account,
		chain: TESTNET,
	});
};

const connect = async () => {
	aegis = findAegis();
	if (!aegis) {
		log("Aegis not detected. Load the unpacked extension, then reload.", "bad");
		return;
	}
	try {
		// biome-ignore lint/suspicious/noExplicitAny: wallet-standard feature shape
		const connectFeature = aegis.features["standard:connect"] as any;
		const result = await connectFeature.connect();
		account = result.accounts[0];
		setConnected(true);
		$("acct").textContent = account.address;
		log(`Connected ${account.address.slice(0, 10)}…`, "ok");
	} catch (err) {
		log(`Connect rejected: ${(err as Error).message}`, "bad");
	}
};

const sendBenign = async () => {
	try {
		log("Proposing a 0.01 SUI transfer to your own address — the bouncer should pass it…");
		const tx = new Transaction();
		tx.setSender(account.address);
		const [coin] = tx.splitCoins(tx.gas, [10_000_000]);
		// Send to the connected account itself — an unambiguously safe transaction.
		tx.transferObjects([coin], account.address);
		const out = await signAndExecute(tx);
		log(`Approved + broadcast. Digest ${out.digest}`, "ok");
	} catch (err) {
		log(`Send not completed: ${(err as Error).message}`, "bad");
	}
};

const drain = async () => {
	try {
		log("Proposing a drain (~95% of balance) — the bouncer should BLOCK it…");
		const total = await getBalance(account.address);
		const amount = (total * 95n) / 100n;
		const tx = new Transaction();
		tx.setSender(account.address);
		const [coin] = tx.splitCoins(tx.gas, [amount]);
		tx.transferObjects([coin], DRAIN_RECIPIENT);
		const out = await signAndExecute(tx);
		log(`Unexpectedly approved. Digest ${out.digest}`, "bad");
	} catch (err) {
		log(`Blocked / rejected by the bouncer: ${(err as Error).message}`, "ok");
	}
};

$("connectBtn").addEventListener("click", () => void connect());
$("sendBtn").addEventListener("click", () => void sendBenign());
$("drainBtn").addEventListener("click", () => void drain());

// Re-check detection when wallets announce themselves.
getWallets().on("register", () => {
	if (!aegis && findAegis()) {
		log("Aegis detected. Click Connect.", "ok");
	}
});

if (findAegis()) {
	log("Aegis detected. Click Connect.", "ok");
} else {
	log("Waiting for the Aegis extension to register…");
}
