import { siteConfig, applySiteChrome, initRevealAnimations } from "./site-shell.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = siteConfig;
const founderName = config.founder?.name ?? "James Montford";
const brandName = config.brand?.name ?? "Montford Reserve Metals";

const defaultPurityMap = {
  "10K": 0.417,
  "14K": 0.585,
  "18K": 0.75,
  "22K": 0.916,
  "24K": 0.999
};

const purityMap = config.valuation?.purityByKarat ?? defaultPurityMap;
const defaultHousePrice = Number(config.valuation?.houseBuyPricePerOunce ?? 0);
const supabaseConfig = config.supabase ?? {};
const estimateFunctionName = supabaseConfig.estimateFunctionName || "estimate-payout";

applySiteChrome();

const estimatorForm = document.getElementById("estimator-form");
const housePriceInput = document.getElementById("house-price");
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

if (housePriceInput && !housePriceInput.value) {
  housePriceInput.value = defaultHousePrice.toFixed(2);
}

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

function getEstimateContext() {
  const karat = document.getElementById("karat")?.value ?? "14K";
  const itemSummary = document.getElementById("item-summary")?.value?.trim() || "Gold items";
  const weight = Number(document.getElementById("weight")?.value ?? 0);
  const housePrice = Number(document.getElementById("house-price")?.value ?? 0);
  const purity = Number(purityMap[karat] ?? 0);

  const estimate = weight > 0 && housePrice > 0
    ? (weight * purity * housePrice) / 31.1035
    : 0;

  return {
    itemSummary,
    metalType: "gold",
    karat,
    weight,
    housePrice,
    estimate
  };
}

function buildEstimateContextKey(baseContext) {
  return `${baseContext.metalType}:${baseContext.karat}:${baseContext.weight.toFixed(2)}`;
}

function renderManualEstimate(baseContext) {
  setEstimateDisplay(
    baseContext.estimate,
    `Based on the submitted details, the estimated amount you would receive is ${currencyFormatter.format(baseContext.estimate)}. Submit promptly to help lock in this estimate before gold prices change.`,
    baseContext.estimate
  );
}

function setEstimateDisplay(amount, summary, fallbackAmount = amount) {
  if (estimateAmount) {
    estimateAmount.textContent = currencyFormatter.format(fallbackAmount ?? 0);
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

function scheduleEstimateRefresh() {
  latestEstimate = null;

  if (!supabase) {
    renderManualEstimate(getEstimateContext());
    return;
  }

  if (estimateRefreshTimer) {
    window.clearTimeout(estimateRefreshTimer);
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
    renderManualEstimate(baseContext);
    latestEstimate = {
      estimatedQuote: Number(baseContext.estimate.toFixed(2)),
      marketSpotPerOunce: Number(baseContext.housePrice.toFixed(2)),
      marketSnapshotAt: null,
      marketSource: "manual",
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

  const { data, error } = await supabase.functions.invoke(estimateFunctionName, {
    body: {
      metalType: baseContext.metalType,
      karat: baseContext.karat,
      weightGrams: baseContext.weight
    }
  });

  if (requestSequence !== estimateRequestSequence) {
    return latestEstimate;
  }

  if (error) {
    setEstimateDisplay(
      0,
      "The live payout estimate is temporarily unavailable. Please wait a moment or submit your request for manual review.",
      0
    );
    console.error(error);
    return null;
  }

  latestEstimate = {
    estimatedQuote: Number(data.estimatedQuote ?? 0),
    marketSpotPerOunce: Number(data.marketSpotPerOunce ?? 0),
    marketSnapshotAt: data.marketSnapshotAt ?? null,
    marketSource: data.marketSource ?? "metals.dev",
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

function setRequestStatus(message, tone = "warning") {
  if (!requestStatus) {
    return;
  }

  requestStatus.textContent = message;
  requestStatus.className = `form-status ${tone}`;
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

function resetLeadFields() {
  [
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
    if (field) {
      field.value = "";
    }
  });

  const settlementPreference = document.getElementById("settlement-preference");
  if (settlementPreference) {
    settlementPreference.value = "Undecided";
  }

  syncSettlementFieldVisibility();
  syncRequestButtonState();
}

if (isSupabaseConfigured()) {
  supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  setRequestStatus(`Live intake is enabled. Market-backed payout estimates and new private review requests will be stored for ${founderName}'s office review.`, "success");
  setEstimateLoading("Loading the latest payout estimate...");
}

if (estimatorForm) {
  const estimateFields = ["karat", "weight"];

  estimateFields.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (!field) {
      return;
    }

    ["change", "input"].forEach((eventName) => {
      field.addEventListener(eventName, scheduleEstimateRefresh);
    });
  });

  settlementPreferenceField?.addEventListener("change", syncSettlementFieldVisibility);
  estimatorForm.addEventListener("input", syncRequestButtonState);
  estimatorForm.addEventListener("change", syncRequestButtonState);

  estimatorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

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
      claimed_karat: baseContext.karat,
      claimed_weight_grams: Number(baseContext.weight.toFixed(2)),
      house_buy_price_per_ounce: supabase ? null : Number(baseContext.housePrice.toFixed(2)),
      market_spot_per_ounce: estimateContext.marketSpotPerOunce
        ? Number(estimateContext.marketSpotPerOunce.toFixed(2))
        : null,
      market_source: estimateContext.marketSource || null,
      market_snapshot_at: estimateContext.marketSnapshotAt || null,
      estimated_quote: Number(estimateContext.estimatedQuote.toFixed(2)),
      preferred_settlement: preferredSettlement,
      bank_routing_number: settlementRequiresBanking(preferredSettlement) ? bankRoutingNumber : null,
      bank_account_number: settlementRequiresBanking(preferredSettlement) ? bankAccountNumber : null,
      notes: notes || null,
      source: "website",
      source_page: window.location.pathname
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
  });
}

if (estimatorForm) {
  syncSettlementFieldVisibility();
  syncRequestButtonState();
  scheduleEstimateRefresh();
}

initRevealAnimations();
