import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";

const ENDPOINT = "https://runtime.rootlogos.com/v1/participation";
const NETWORK = "eip155:8453";
const CHAIN_ID = "0x2105";
const PAY_TO = "0x13c474081BEc0459F06F750E687ffeB4a35A4F39";
const PAYER = "0xDCb1f13E94FDd3d9Bb55D3241F407099D0870bf8";
const AMOUNT = "50000";
const ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const status = document.querySelector("#status");
const button = document.querySelector("#authorize");
const observation = document.querySelector("#observation");
const receipt = document.querySelector("#receipt");

const setStatus = (message, state = "") => {
  status.textContent = message;
  status.dataset.state = state;
};

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
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const address = accounts?.[0];
    if (!address || address.toLowerCase() !== PAYER.toLowerCase()) {
      throw new Error(`Select the funded Ledger Base account ${PAYER.slice(0, 8)}…${PAYER.slice(-6)}.`);
    }
    const currentChain = await window.ethereum.request({ method: "eth_chainId" });
    if (currentChain?.toLowerCase() !== CHAIN_ID) {
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID }] });
    }

    const contributionId = `root_logos_${crypto.randomUUID().replaceAll("-", "_")}`;
    const body = {
      contribution_id: contributionId,
      contribution_kind: "question",
      observation: observation.value.trim(),
      attribution: "Root Logos Ledger proof",
      participant_class: "human-machine",
      consent: true
    };
    if (body.observation.length < 20) throw new Error("The contribution must contain at least 20 characters.");

    setStatus("Reading the signed payment boundary…");
    const unpaid = await fetch(ENDPOINT, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
    });
    if (unpaid.status !== 402) throw new Error(`Expected payment declaration; received HTTP ${unpaid.status}.`);

    const signer = {
      address,
      signTypedData: ({ domain, types, primaryType, message }) => window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [address, JSON.stringify({ domain, types, primaryType, message })]
      })
    };
    const core = x402Client.fromConfig({
      schemes: [{ network: NETWORK, client: new ExactEvmScheme(signer) }],
      spendControls: { maxAmountPerPayment: "$0.05" },
      policies: [(_version, choices) => choices.filter((choice) =>
        choice.network === NETWORK &&
        choice.payTo?.toLowerCase() === PAY_TO.toLowerCase() &&
        choice.asset?.toLowerCase() === ASSET.toLowerCase() &&
        choice.amount === AMOUNT
      )]
    });
    const httpClient = new x402HTTPClient(core);
    const required = httpClient.getPaymentRequiredResponse(
      (name) => unpaid.headers.get(name),
      await unpaid.json()
    );
    assertDeclaration(required);
    appendPaymentIdentifierToExtensions(required.extensions ||= {}, contributionId);

    setStatus("Confirm exactly 0.05 USDC on Base on your Ledger device…", "signing");
    const paymentPayload = await httpClient.createPaymentPayload(required);
    const paid = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", ...httpClient.encodePaymentSignatureHeader(paymentPayload) },
      body: JSON.stringify(body)
    });
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
