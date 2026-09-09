import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";

const ENDPOINT = "https://runtime.rootlogos.com/v1/evaluation";
const NETWORK = "eip155:8453";
const CHAIN_ID = "0x2105";
const PAY_TO = "0x13c474081BEc0459F06F750E687ffeB4a35A4F39";
const PAYER = "0xDCb1f13E94FDd3d9Bb55D3241F407099D0870bf8";
const AMOUNT = "50000";
const ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const status = document.querySelector("#status");
const button = document.querySelector("#authorize");
const statement = document.querySelector("#statement");
const receipt = document.querySelector("#receipt");
const setStatus = (message, state = "") => { status.textContent = message; status.dataset.state = state; };
const ledgerJson = (value) => JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item);

const assertDeclaration = (required) => {
  const accepted = required.accepts?.find((entry) => entry.network === NETWORK && entry.scheme === "exact");
  if (!accepted) throw new Error("Root Logos did not offer the expected Base payment method.");
  if (accepted.payTo?.toLowerCase() !== PAY_TO.toLowerCase()) throw new Error("Receiving address does not match Root Logos.");
  if (accepted.asset?.toLowerCase() !== ASSET.toLowerCase()) throw new Error("Payment asset is not canonical Base USDC.");
  if (accepted.amount !== AMOUNT) throw new Error("Payment amount is not exactly $0.05.");
};

button.addEventListener("click", async () => {
  button.disabled = true;
  receipt.hidden = true;
  try {
    if (!window.ethereum) throw new Error("Open this page as the Root Logos local app inside Ledger Live.");
    setStatus("Requesting the Base account from Ledger Live…");
    const address = (await window.ethereum.request({ method: "eth_requestAccounts" }))?.[0];
    if (!address || address.toLowerCase() !== PAYER.toLowerCase()) throw new Error(`Select the funded Ledger Base account ${PAYER.slice(0, 8)}…${PAYER.slice(-6)}.`);
    if ((await window.ethereum.request({ method: "eth_chainId" }))?.toLowerCase() !== CHAIN_ID) {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
    }

    const evaluationId = `root_logos_eval_${crypto.randomUUID().replaceAll("-", "_")}`;
    const body = { evaluation_id: evaluationId, subject_kind: "action", statement: statement.value.trim(), consent: true };
    if (body.statement.length < 20) throw new Error("The evaluation subject must contain at least 20 characters.");
    setStatus("Reading the signed payment boundary…");
    const unpaid = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (unpaid.status !== 402) throw new Error(`Expected payment declaration; received HTTP ${unpaid.status}.`);

    const signer = { address, signTypedData: ({ domain, types, primaryType, message }) => window.ethereum.request({
      method: "eth_signTypedData_v4", params: [address, ledgerJson({ domain, types, primaryType, message })]
    }) };
    const core = x402Client.fromConfig({
      schemes: [{ network: NETWORK, client: new ExactEvmScheme(signer) }],
      spendControls: { maxAmountPerPayment: "$0.05" },
      policies: [(_version, choices) => choices.filter((choice) => choice.network === NETWORK && choice.payTo?.toLowerCase() === PAY_TO.toLowerCase() && choice.asset?.toLowerCase() === ASSET.toLowerCase() && choice.amount === AMOUNT)]
    });
    const httpClient = new x402HTTPClient(core);
    const required = httpClient.getPaymentRequiredResponse((name) => unpaid.headers.get(name), await unpaid.json());
    assertDeclaration(required);
    appendPaymentIdentifierToExtensions(required.extensions ||= {}, evaluationId);
    setStatus("Confirm exactly 0.05 USDC on Base on your Ledger device…", "signing");
    const paymentPayload = await httpClient.createPaymentPayload(required);
    const paid = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", ...httpClient.encodePaymentSignatureHeader(paymentPayload) }, body: JSON.stringify(body) });
    const result = await paid.json();
    if (!paid.ok) throw new Error(result.error || `Payment failed with HTTP ${paid.status}.`);
    const settlement = httpClient.getPaymentSettleResponse((name) => paid.headers.get(name));
    receipt.textContent = JSON.stringify({ receipt: result, settlement }, null, 2);
    receipt.hidden = false;
    setStatus(`Settled on Base · ${settlement.transaction}`, "complete");
  } catch (error) {
    setStatus(error.message || String(error), "error");
  } finally {
    button.disabled = false;
  }
});
