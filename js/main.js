import { siteConfig, applySiteChrome, initRevealAnimations } from "./site-shell.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  getDefaultPuritySelection,
  getMetalLabel,
  getPurityOptions,
  getPuritySelection,
  normalizeMetalType
} from "./metals.js";

const config = siteConfig;
const founderName = config.founder?.name ?? "James Montford";
const brandName = config.brand?.name ?? "Montford Reserve Metals";
const supabaseConfig = config.supabase ?? {};
const estimateFunctionName = supabaseConfig.estimateFunctionName || "estimate-payout";

applySiteChrome();

const estimatorForm = document.getElementById("estimator-form");
const metalTypeField = document.getElementById("metal-type");
const goldKaratField = document.getElementById("gold-karat-field");
const karatField = document.getElementById("karat");
const purityField = document.getElementById("purity-field");
const puritySelectionField = document.getElementById("purity-selection");
const estimateAmount = document.getElementById("estimate-amount");
const estimateSummary = document.getElementById("estimate-summary");
const requestStatus = document.getElementById("request-status");
const requestButton = document.getElementById("request-button");
const settlementPreferenceField = document.getElementById("settlement-preference");
const settlementBankFields = document.getElementById("settlement-bank-fields");
const bankRoutingNumberInput = document.getElementById("bank-routing-number");
const bankAccountNumberInput = document.getElementById("bank-account-number");

let supabase = null;
let latestEstimate = null;
let estimateRequestSequence = 0;
let estimateRefreshTimer = null;

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function settlementRequiresBanking(method) {
  return ["Bank wire", "ACH"].includes(String(method || "").trim());
}

function setRequestStatus(message, tone = "warning") {
  if (!requestStatus) {
    return;
  }

  requestStatus.textContent = message;
  requestStatus.className = `form-status ${tone}`;
}

function setEstimateDisplay(amount, summary, fallbackAmount = amount) {
  if (estimateAmount) {
    estimateAmount.textContent = currencyFormatter.format(Number(fallbackAmount || 0));
  }

  if (estimateSummary) {
    estimateSummary.textContent = summary;
  }
}

function setEstimateLoading(message = "Updating the payout estimate from the latest market snapshot...") {
  if (estimateSummary) {
    estimateSummary.textContent = message;
  }
}

function isSupabaseConfigured() {
  const { url, anonKey } = supabaseConfig;

  return Boolean(
    url &&
    anonKey &&
    !url.includes("YOUR_SUPABASE_URL") &&
    !anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  );
}

function syncRequestButtonState() {
  if (!requestButton || !estimatorForm || requestButton.dataset.submitting === "true") {
    return;
  }

  requestButton.disabled = !estimatorForm.checkValidity();
}

function syncSettlementFieldVisibility() {
  const requiresBanking = settlementRequiresBanking(settlementPreferenceField?.value);

  if (settlementBankFields) {
    settlementBankFields.classList.toggle("hidden", !requiresBanking);
  }

  [bankRoutingNumberInput, bankAccountNumberInput].forEach((field) => {
    if (!field) {
      return;
    }

    field.required = requiresBanking;

    if (!requiresBanking) {
      field.value = "";
    }
  });

  syncRequestButtonState();
}

function populatePurityOptions(metalType) {
  if (!puritySelectionField) {
    return;
  }

  const currentValue = puritySelectionField.value;
  const options = getPurityOptions(metalType);
  puritySelectionField.innerHTML = options.map((option) => {
    const selected = option.value === currentValue ? " selected" : "";
    return `<option value="${option.value}"${selected}>${option.label}</option>`;
  }).join("");

  if (!options.some((option) => option.value === currentValue)) {
    puritySelectionField.value = options[0]?.value ?? "";
  }
}

function syncMetalFieldVisibility() {
  const metalType = normalizeMetalType(metalTypeField?.value);
  const isGold = metalType === "gold";

  goldKaratField?.classList.toggle("hidden", !isGold);
  purityField?.classList.toggle("hidden", isGold);

  if (karatField) {
    karatField.required = isGold;
  }

  if (puritySelectionField) {
    puritySelectionField.required = !isGold;
  }

  populatePurityOptions(metalType);
  syncRequestButtonState();
}

function getEstimateContext() {
  const metalType = normalizeMetalType(metalTypeField?.value);
  const weight = Number(document.getElementById("weight")?.value ?? 0);
  const itemSummary = document.getElementById("item-summary")?.value?.trim() || `${getMetalLabel(metalType)} items`;

  if (metalType === "gold") {
    const selection = getPuritySelection("gold", karatField?.value);
    return {
      itemSummary,
      metalType,
      metalLabel: getMetalLabel(metalType),
      karat: selection.karat ?? "14K",
      purity: selection.purity,
      purityLabel: selection.label,
      weight
    };
  }

  const selection = getPuritySelection(metalType, puritySelectionField?.value);
  return {
    itemSummary,
    metalType,
    metalLabel: getMetalLabel(metalType),
    karat: null,
    purity: selection.purity,
    purityLabel: selection.label,
    weight
  };
}

function buildEstimateContextKey(baseContext) {
  return [
    baseContext.metalType,
    baseContext.karat || "",
    Number(baseContext.purity || 0).toFixed(4),
    Number(baseContext.weight || 0).toFixed(2)
  ].join(":");
}

function renderUnavailableEstimate(baseContext) {
  setEstimateDisplay(
    0,
    `The live ${baseContext.metalLabel.toLowerCase()} estimate is temporarily unavailable. Submit the request for manual office review and we will respond directly.`,
    0
  );
}

function scheduleEstimateRefresh() {
  latestEstimate = null;

  if (estimateRefreshTimer) {
    window.clearTimeout(estimateRefreshTimer);
  }

  if (!supabase) {
    renderUnavailableEstimate(getEstimateContext());
    return;
  }

  setEstimateLoading();

  estimateRefreshTimer = window.setTimeout(() => {
    refreshEstimate({ showLoading: false }).catch((error) => console.error(error));
  }, 250);
}

async function refreshEstimate({ showLoading = true } = {}) {
  const baseContext = getEstimateContext();
  const contextKey = buildEstimateContextKey(baseContext);

  if (!supabase) {
    renderUnavailableEstimate(baseContext);
    latestEstimate = {
      estimatedQuote: 0,
      marketSpotPerOunce: 0,
      marketSnapshotAt: null,
      marketSource: null,
      contextKey
    };
    return latestEstimate;
  }

  if (estimateRefreshTimer) {
    window.clearTimeout(estimateRefreshTimer);
    estimateRefreshTimer = null;
  }

  const requestSequence = ++estimateRequestSequence;

  if (showLoading) {
    setEstimateLoading();
  }

  const requestBody = {
    metalType: baseContext.metalType,
    weightGrams: baseContext.weight
  };

  if (baseContext.metalType === "gold") {
    requestBody.karat = baseContext.karat;
  } else {
    requestBody.purity = baseContext.purity;
  }

  const { data, error } = await supabase.functions.invoke(estimateFunctionName, {
    body: requestBody
  });

  if (requestSequence !== estimateRequestSequence) {
    return latestEstimate;
  }

  if (error) {
    renderUnavailableEstimate(baseContext);
    console.error(error);
    return null;
  }

  latestEstimate = {
    estimatedQuote: Number(data.estimatedQuote ?? 0),
    marketSpotPerOunce: Number(data.marketSpotPerOunce ?? 0),
    marketSnapshotAt: data.marketSnapshotAt ?? null,
    marketSource: data.marketSource ?? null,
    contextKey
  };

  setEstimateDisplay(
    latestEstimate.estimatedQuote,
    data.message ||
      `Based on current market conditions, the estimated amount you would receive is ${currencyFormatter.format(latestEstimate.estimatedQuote)}. Submit promptly to help lock in this estimate before prices change.`,
    latestEstimate.estimatedQuote
  );

  return latestEstimate;
}

function resetLeadFields() {
  [
    "item-summary",
    "weight",
    "client-name",
    "client-email",
    "client-phone",
    "address-line1",
    "address-city",
    "address-state",
    "address-postal-code",
    "bank-routing-number",
    "bank-account-number",
    "client-notes",
    "website"
  ].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) {
      return;
    }

    if (field instanceof HTMLInputElement && field.type === "number") {
      field.value = fieldId === "weight" ? "42.0" : "";
      return;
    }

    field.value = "";
  });

  if (metalTypeField) {
    metalTypeField.value = "gold";
  }

  if (karatField) {
    karatField.value = "14K";
  }

  if (settlementPreferenceField) {
    settlementPreferenceField.value = "Undecided";
  }

  syncMetalFieldVisibility();
  syncSettlementFieldVisibility();
  syncRequestButtonState();
}

if (isSupabaseConfigured()) {
  supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  setRequestStatus(
    `Live intake is enabled. Market-backed payout estimates and new private review requests will be stored for ${founderName}'s office review.`,
    "success"
  );
  setEstimateLoading("Loading the latest payout estimate...");
}

if (estimatorForm) {
  syncMetalFieldVisibility();
  syncSettlementFieldVisibility();
  syncRequestButtonState();
  scheduleEstimateRefresh();

  ["metal-type", "karat", "purity-selection", "weight"].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) {
      return;
    }

    ["change", "input"].forEach((eventName) => {
      field.addEventListener(eventName, () => {
        if (fieldId === "metal-type") {
          syncMetalFieldVisibility();
        }
        scheduleEstimateRefresh();
      });
    });
  });

  settlementPreferenceField?.addEventListener("change", syncSettlementFieldVisibility);
  estimatorForm.addEventListener("input", syncRequestButtonState);
  estimatorForm.addEventListener("change", syncRequestButtonState);

  estimatorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    syncMetalFieldVisibility();
    syncSettlementFieldVisibility();

    if (!estimatorForm.reportValidity()) {
      setRequestStatus("Complete every required field before sending the request.", "warning");
      return;
    }

    const baseContext = getEstimateContext();
    const contextKey = buildEstimateContextKey(baseContext);
    const estimateContext = latestEstimate?.contextKey === contextKey
      ? latestEstimate
      : await refreshEstimate();
    const fullName = String(document.getElementById("client-name")?.value ?? "").trim();
    const email = String(document.getElementById("client-email")?.value ?? "").trim();
    const phone = String(document.getElementById("client-phone")?.value ?? "").trim();
    const addressLine1 = String(document.getElementById("address-line1")?.value ?? "").trim();
    const city = String(document.getElementById("address-city")?.value ?? "").trim();
    const state = String(document.getElementById("address-state")?.value ?? "").trim();
    const postalCode = String(document.getElementById("address-postal-code")?.value ?? "").trim();
    const preferredSettlement = String(document.getElementById("settlement-preference")?.value ?? "Undecided");
    const bankRoutingNumber = normalizeDigits(document.getElementById("bank-routing-number")?.value ?? "");
    const bankAccountNumber = normalizeDigits(document.getElementById("bank-account-number")?.value ?? "");
    const notes = String(document.getElementById("client-notes")?.value ?? "").trim();
    const honeypot = String(document.getElementById("website")?.value ?? "").trim();

    if (!fullName || !email || !phone || !addressLine1 || !city || !state || !postalCode || !baseContext.itemSummary || baseContext.weight <= 0) {
      setRequestStatus("Complete the client, address, and item details before sending the request.", "warning");
      return;
    }

    if (settlementRequiresBanking(preferredSettlement)) {
      if (bankRoutingNumber.length !== 9) {
        setRequestStatus("Enter a valid 9-digit routing number before sending the request.", "warning");
        bankRoutingNumberInput?.focus();
        return;
      }

      if (bankAccountNumber.length < 4) {
        setRequestStatus("Enter the bank account number before sending the request.", "warning");
        bankAccountNumberInput?.focus();
        return;
      }
    }

    if (!estimateContext) {
      setRequestStatus("The live payout estimate could not be prepared. Please wait a moment and try again.", "warning");
      return;
    }

    if (honeypot) {
      setRequestStatus("Request received. If the submission is a fit, the private office will follow up shortly.", "success");
      resetLeadFields();
      return;
    }

    if (!supabase) {
      setRequestStatus("Private-review intake is not connected yet. Add your Supabase project URL and anon key in js/site-config.js to enable live submissions.", "warning");
      return;
    }

    requestButton?.setAttribute("disabled", "disabled");
    if (requestButton) {
      requestButton.dataset.submitting = "true";
      requestButton.textContent = "Sending...";
    }

    const payload = {
      full_name: fullName,
      email,
      phone,
      address_line1: addressLine1,
      city,
      state,
      postal_code: postalCode,
      metal_type: baseContext.metalType,
      item_summary: baseContext.itemSummary,
      claimed_karat: baseContext.metalType === "gold" ? baseContext.karat : "mixed",
      claimed_purity: Number(baseContext.purity.toFixed(4)),
      claimed_purity_label: baseContext.purityLabel,
      claimed_weight_grams: Number(baseContext.weight.toFixed(2)),
      estimated_quote: Number(estimateContext.estimatedQuote.toFixed(2)),
      preferred_settlement: preferredSettlement,
      bank_routing_number: settlementRequiresBanking(preferredSettlement) ? bankRoutingNumber : null,
      bank_account_number: settlementRequiresBanking(preferredSettlement) ? bankAccountNumber : null,
      notes: notes || null,
      source: "website",
      source_page: window.location.pathname,
      submission_type: "single",
      itemized_items: null,
      market_spot_per_ounce: estimateContext.marketSpotPerOunce
        ? Number(estimateContext.marketSpotPerOunce.toFixed(2))
        : null,
      market_source: estimateContext.marketSource || null,
      market_snapshot_at: estimateContext.marketSnapshotAt || null
    };

    const { error } = await supabase
      .from("intake_requests")
      .insert(payload);

    requestButton?.removeAttribute("disabled");
    if (requestButton) {
      delete requestButton.dataset.submitting;
      requestButton.textContent = "Send private request";
    }
    syncRequestButtonState();

    if (error) {
      setRequestStatus(
        "The request could not be saved. Confirm the intake_requests table and insert policy are in Supabase, then try again.",
        "warning"
      );
      console.error(error);
      return;
    }

    setRequestStatus(
      `${brandName} has received the request. If this client later signs into the portal with the same email address, the submission can appear there automatically as a submitted file.`,
      "success"
    );
    resetLeadFields();
    scheduleEstimateRefresh();
  });
}

initRevealAnimations();
