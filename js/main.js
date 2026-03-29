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

applySiteChrome();

const estimatorForm = document.getElementById("estimator-form");
const housePriceInput = document.getElementById("house-price");
const estimateAmount = document.getElementById("estimate-amount");
const estimateSummary = document.getElementById("estimate-summary");
const calculateButton = document.getElementById("calculate-button");
const requestStatus = document.getElementById("request-status");
const requestButton = document.getElementById("request-button");

if (housePriceInput && !housePriceInput.value) {
  housePriceInput.value = defaultHousePrice.toFixed(2);
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

function calculateEstimate() {
  const karat = document.getElementById("karat")?.value ?? "14K";
  const itemSummary = document.getElementById("item-summary")?.value?.trim() || "Gold items";
  const weight = Number(document.getElementById("weight")?.value ?? 0);
  const housePrice = Number(document.getElementById("house-price")?.value ?? 0);
  const purity = Number(purityMap[karat] ?? 0);

  const estimate = weight > 0 && housePrice > 0
    ? (weight * purity * housePrice) / 31.1035
    : 0;

  if (estimateAmount) {
    estimateAmount.textContent = currencyFormatter.format(estimate);
  }

  if (estimateSummary) {
    estimateSummary.textContent =
      `${itemSummary} at ${karat} purity, ${weight.toFixed(1)} grams, and a manual house buy price of ` +
      `${currencyFormatter.format(housePrice)} per pure ounce yields an indicative estimate of ${currencyFormatter.format(estimate)}.`;
  }

  return {
    itemSummary,
    karat,
    weight,
    housePrice,
    estimate
  };
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
  ["client-name", "client-email", "client-phone", "client-notes", "website"].forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = "";
    }
  });

  const settlementPreference = document.getElementById("settlement-preference");
  if (settlementPreference) {
    settlementPreference.value = "Undecided";
  }
}

if (estimatorForm) {
  ["change", "input"].forEach((eventName) => {
    estimatorForm.addEventListener(eventName, calculateEstimate);
  });

  calculateEstimate();
}

if (calculateButton) {
  calculateButton.addEventListener("click", () => {
    calculateEstimate();
  });
}

let supabase = null;

if (isSupabaseConfigured()) {
  supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  setRequestStatus(`Live intake is enabled. New private review requests will be stored for ${founderName}'s office review.`, "success");
}

if (estimatorForm) {
  estimatorForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const estimateContext = calculateEstimate();
    const fullName = String(document.getElementById("client-name")?.value ?? "").trim();
    const email = String(document.getElementById("client-email")?.value ?? "").trim();
    const phone = String(document.getElementById("client-phone")?.value ?? "").trim();
    const preferredSettlement = String(document.getElementById("settlement-preference")?.value ?? "Undecided");
    const notes = String(document.getElementById("client-notes")?.value ?? "").trim();
    const honeypot = String(document.getElementById("website")?.value ?? "").trim();

    if (!fullName || !email || !estimateContext.itemSummary || estimateContext.weight <= 0) {
      setRequestStatus("Complete the client and item details before sending the request.", "warning");
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
    requestButton.textContent = "Sending...";

    const payload = {
      full_name: fullName,
      email,
      phone: phone || null,
      item_summary: estimateContext.itemSummary,
      claimed_karat: estimateContext.karat,
      claimed_weight_grams: Number(estimateContext.weight.toFixed(2)),
      house_buy_price_per_ounce: Number(estimateContext.housePrice.toFixed(2)),
      estimated_quote: Number(estimateContext.estimate.toFixed(2)),
      preferred_settlement: preferredSettlement,
      notes: notes || null,
      source: "website",
      source_page: window.location.pathname
    };

    const { error } = await supabase
      .from("intake_requests")
      .insert(payload);

    requestButton?.removeAttribute("disabled");
    requestButton.textContent = "Send private request";

    if (error) {
      setRequestStatus(
        "The request could not be saved. Confirm the intake_requests table and insert policy are in Supabase, then try again.",
        "warning"
      );
      console.error(error);
      return;
    }

    setRequestStatus(
      `${brandName} has received the request. Review it in Supabase intake_requests, then convert qualified submissions into private-client files and quotes.`,
      "success"
    );
    resetLeadFields();
  });
}

initRevealAnimations();
