import { siteConfig, applySiteChrome, initRevealAnimations } from "./site-shell.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  getDefaultPuritySelection,
  getMetalLabel,
  getPurityOptions,
  getPuritySelection,
  metalOptions,
  normalizeMetalType
} from "./metals.js";

const config = siteConfig;
const brandName = config.brand?.name ?? "Montford Reserve Metals";
const supabaseConfig = config.supabase ?? {};
const estimateFunctionName = supabaseConfig.estimateFunctionName || "estimate-payout";
const draftStorageKey = "montford-itemized-builder-draft-v1";

applySiteChrome();

const builderForm = document.getElementById("itemized-builder-form");
const builderItems = document.getElementById("builder-items");
const addBuilderItemButton = document.getElementById("add-builder-item");
const clearBuilderDraftButton = document.getElementById("clear-builder-draft");
const draftState = document.getElementById("builder-draft-state");
const builderEstimateAmount = document.getElementById("builder-estimate-amount");
const builderEstimateSummary = document.getElementById("builder-estimate-summary");
const builderSummaryList = document.getElementById("builder-summary-list");
const builderRequestStatus = document.getElementById("builder-request-status");
const builderRequestButton = document.getElementById("builder-request-button");
const settlementPreferenceField = document.getElementById("builder-settlement-preference");
const settlementBankFields = document.getElementById("builder-settlement-bank-fields");
const bankRoutingNumberInput = document.getElementById("builder-bank-routing-number");
const bankAccountNumberInput = document.getElementById("builder-bank-account-number");

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const state = {
  supabase: null,
  estimateTimer: null,
  estimateRequestSequence: 0,
  lineItemsById: new Map(),
  totalEstimate: 0
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function settlementRequiresBanking(method) {
  return ["Bank wire", "ACH"].includes(String(method || "").trim());
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function getFunctionErrorMessage(error) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string") {
    return error.message;
  }

  if (typeof error.context === "string") {
    return error.context;
  }

  return "";
}

function isConfigured() {
  const { url, anonKey } = supabaseConfig;
  return Boolean(
    url &&
    anonKey &&
    !url.includes("YOUR_SUPABASE_URL") &&
    !anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  );
}

function setRequestStatus(message, tone = "warning") {
  if (!builderRequestStatus) {
    return;
  }

  builderRequestStatus.textContent = message;
  builderRequestStatus.className = `form-status ${tone}`;
}

function setDraftState(message) {
  if (draftState) {
    draftState.textContent = message;
  }
}

function setBuilderEstimateDisplay(amount, summary) {
  if (builderEstimateAmount) {
    builderEstimateAmount.textContent = formatCurrency(amount);
  }

  if (builderEstimateSummary) {
    builderEstimateSummary.textContent = summary;
  }
}

function setEstimateLoading() {
  if (builderEstimateSummary) {
    builderEstimateSummary.textContent = "Updating the combined estimate from the latest market snapshot...";
  }
}

function buildMetalOptions(selectedMetal) {
  return metalOptions.map((option) => {
    const selected = normalizeMetalType(selectedMetal) === option.value ? " selected" : "";
    return `<option value="${option.value}"${selected}>${option.label}</option>`;
  }).join("");
}

function buildPurityOptions(metalType, selectedValue) {
  return getPurityOptions(metalType).map((option) => {
    const selected = option.value === selectedValue ? " selected" : "";
    return `<option value="${option.value}"${selected}>${option.label}</option>`;
  }).join("");
}

function createEmptyItem(partial = {}) {
  const metalType = normalizeMetalType(partial.metalType);
  const defaultPurity = getDefaultPuritySelection(metalType);

  return {
    id: partial.id || `builder-item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    description: partial.description || "",
    metalType,
    purityValue: partial.purityValue || partial.karat || defaultPurity.value,
    weightGrams: partial.weightGrams || ""
  };
}

function loadDraft() {
  try {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) {
      return null;
    }

    const parsed = JSON.parse(rawDraft);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function saveDraft() {
  if (!builderForm) {
    return;
  }

  const payload = {
    savedAt: new Date().toISOString(),
    items: collectItems(),
    form: {
      fullName: document.getElementById("builder-client-name")?.value ?? "",
      email: document.getElementById("builder-client-email")?.value ?? "",
      phone: document.getElementById("builder-client-phone")?.value ?? "",
      addressLine1: document.getElementById("builder-address-line1")?.value ?? "",
      city: document.getElementById("builder-address-city")?.value ?? "",
      state: document.getElementById("builder-address-state")?.value ?? "",
      postalCode: document.getElementById("builder-address-postal-code")?.value ?? "",
      preferredSettlement: settlementPreferenceField?.value ?? "Undecided",
      bankRoutingNumber: bankRoutingNumberInput?.value ?? "",
      bankAccountNumber: bankAccountNumberInput?.value ?? "",
      notes: document.getElementById("builder-client-notes")?.value ?? ""
    }
  };

  window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
  setDraftState("Draft saved on this browser.");
}

function clearDraftStorage() {
  window.localStorage.removeItem(draftStorageKey);
}

function hydrateDraft() {
  const draft = loadDraft();
  const items = Array.isArray(draft?.items) && draft.items.length
    ? draft.items.map((item) => createEmptyItem(item))
    : [createEmptyItem()];

  renderItems(items);

  if (!draft?.form) {
    syncSettlementFieldVisibility();
    syncRequestButtonState();
    return;
  }

  document.getElementById("builder-client-name").value = draft.form.fullName || "";
  document.getElementById("builder-client-email").value = draft.form.email || "";
  document.getElementById("builder-client-phone").value = draft.form.phone || "";
  document.getElementById("builder-address-line1").value = draft.form.addressLine1 || "";
  document.getElementById("builder-address-city").value = draft.form.city || "";
  document.getElementById("builder-address-state").value = draft.form.state || "";
  document.getElementById("builder-address-postal-code").value = draft.form.postalCode || "";
  settlementPreferenceField.value = draft.form.preferredSettlement || "Undecided";
  bankRoutingNumberInput.value = draft.form.bankRoutingNumber || "";
  bankAccountNumberInput.value = draft.form.bankAccountNumber || "";
  document.getElementById("builder-client-notes").value = draft.form.notes || "";

  syncSettlementFieldVisibility();
  syncRequestButtonState();
  setDraftState(draft.savedAt ? `Draft restored from ${new Date(draft.savedAt).toLocaleString()}.` : "Draft restored.");
}

function renderItems(items) {
  builderItems.innerHTML = items.map((item, index) => `
    <article class="builder-item-card" data-builder-item-id="${item.id}">
      <div class="builder-item-head">
        <div>
          <span class="panel-topline">Item ${index + 1}</span>
          <strong>Precious-metals line item</strong>
        </div>
        <button class="button button-secondary builder-remove-button" type="button" data-remove-builder-item="${item.id}"${items.length === 1 ? " disabled" : ""}>
          Remove
        </button>
      </div>

      <div class="builder-item-grid">
        <label class="form-span-2">
          Item description
          <input
            name="description"
            type="text"
            value="${escapeHtml(item.description)}"
            placeholder="Sterling silver flatware set, 1 oz gold bar, platinum wedding band"
            required
          >
        </label>

        <label>
          Metal
          <select name="metalType">
            ${buildMetalOptions(item.metalType)}
          </select>
        </label>

        <label>
          Purity
          <select name="purityValue">
            ${buildPurityOptions(item.metalType, item.purityValue)}
          </select>
        </label>

        <label>
          Weight in grams
          <input name="weightGrams" type="number" min="0" step="0.01" value="${escapeHtml(item.weightGrams)}" required>
        </label>
      </div>

      <div class="builder-item-footer">
        <span class="builder-item-copy" data-builder-item-copy>Complete the row to calculate the line estimate.</span>
        <strong class="builder-item-estimate" data-builder-item-estimate>$0</strong>
      </div>
    </article>
  `).join("");
}

function syncSettlementFieldVisibility() {
  const requiresBanking = settlementRequiresBanking(settlementPreferenceField?.value);

  settlementBankFields?.classList.toggle("hidden", !requiresBanking);

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

function syncRequestButtonState() {
  if (!builderRequestButton || !builderForm || builderRequestButton.dataset.submitting === "true") {
    return;
  }

  builderRequestButton.disabled = !builderForm.checkValidity();
}

function syncRowPurityOptions(row) {
  if (!row) {
    return;
  }

  const metalSelect = row.querySelector('select[name="metalType"]');
  const puritySelect = row.querySelector('select[name="purityValue"]');

  if (!metalSelect || !puritySelect) {
    return;
  }

  const currentValue = puritySelect.value;
  const metalType = normalizeMetalType(metalSelect.value);
  puritySelect.innerHTML = buildPurityOptions(metalType, currentValue);

  if (!getPurityOptions(metalType).some((option) => option.value === currentValue)) {
    puritySelect.value = getDefaultPuritySelection(metalType).value;
  }
}

function collectItems() {
  return Array.from(builderItems.querySelectorAll("[data-builder-item-id]")).map((row) => {
    const metalType = normalizeMetalType(row.querySelector('select[name="metalType"]')?.value);
    const purityValue = String(row.querySelector('select[name="purityValue"]')?.value || "");
    const puritySelection = getPuritySelection(metalType, purityValue);

    return {
      id: row.getAttribute("data-builder-item-id"),
      description: String(row.querySelector('input[name="description"]')?.value || "").trim(),
      metalType,
      metalLabel: getMetalLabel(metalType),
      purityValue,
      purity: puritySelection.purity,
      purityLabel: puritySelection.label,
      karat: puritySelection.karat ?? null,
      weightGrams: Number(row.querySelector('input[name="weightGrams"]')?.value || 0)
    };
  });
}

function isCompleteItem(item) {
  return Boolean(
    item.description &&
    item.metalType &&
    item.purityLabel &&
    Number.isFinite(Number(item.weightGrams)) &&
    Number(item.weightGrams) > 0
  );
}

function renderSummaryList(items) {
  builderSummaryList.innerHTML = items.map((item, index) => {
    const estimate = state.lineItemsById.get(item.id);
    const itemAmount = estimate?.estimatedQuote != null ? formatCurrency(estimate.estimatedQuote) : "Pending";
    const itemCopy = `${item.purityLabel} · ${Number(item.weightGrams || 0).toFixed(2)}g`;

    return `
      <article class="builder-summary-row">
        <div>
          <strong>${escapeHtml(`${index + 1}. ${item.description || "Untitled item"}`)}</strong>
          <p>${escapeHtml(itemCopy)}</p>
        </div>
        <span>${escapeHtml(itemAmount)}</span>
      </article>
    `;
  }).join("");
}

function renderInlineItemEstimates(items) {
  items.forEach((item) => {
    const row = builderItems.querySelector(`[data-builder-item-id="${item.id}"]`);
    if (!row) {
      return;
    }

    const copyNode = row.querySelector("[data-builder-item-copy]");
    const amountNode = row.querySelector("[data-builder-item-estimate]");
    const estimate = state.lineItemsById.get(item.id);

    if (!isCompleteItem(item)) {
      if (copyNode) {
        copyNode.textContent = "Complete the row to calculate the line estimate.";
      }
      if (amountNode) {
        amountNode.textContent = "$0";
      }
      return;
    }

    if (!estimate) {
      if (copyNode) {
        copyNode.textContent = `${item.purityLabel} · ${Number(item.weightGrams || 0).toFixed(2)}g`;
      }
      if (amountNode) {
        amountNode.textContent = "Pending";
      }
      return;
    }

    if (copyNode) {
      copyNode.textContent = `${item.purityLabel} · ${Number(item.weightGrams || 0).toFixed(2)}g`;
    }
    if (amountNode) {
      amountNode.textContent = formatCurrency(estimate.estimatedQuote || 0);
    }
  });
}

async function invokeEstimate(body) {
  return state.supabase.functions.invoke(estimateFunctionName, { body });
}

async function estimateItemsBatch(completeItems) {
  const { data, error } = await invokeEstimate({
    items: completeItems.map((item) => ({
      label: item.description,
      metalType: item.metalType,
      karat: item.karat,
      purity: item.purity,
      weightGrams: item.weightGrams
    }))
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data?.lineItems)) {
    throw new Error("Batch estimate payload was not available.");
  }

  return {
    estimatedQuote: Number(data.estimatedQuote || 0),
    lineItems: data.lineItems
  };
}

async function estimateItemsIndividually(completeItems) {
  const results = await Promise.all(
    completeItems.map((item) =>
      invokeEstimate({
        metalType: item.metalType,
        karat: item.karat,
        purity: item.purity,
        weightGrams: item.weightGrams
      })
    )
  );

  const firstError = results.find((result) => result.error)?.error;
  if (firstError) {
    throw firstError;
  }

  const lineItems = results.map((result, index) => ({
    label: completeItems[index].description,
    metalType: result.data?.metalType ?? completeItems[index].metalType,
    karat: result.data?.karat ?? completeItems[index].karat,
    purity: result.data?.purity ?? completeItems[index].purity,
    weightGrams: result.data?.weightGrams ?? completeItems[index].weightGrams,
    estimatedQuote: Number(result.data?.estimatedQuote ?? 0),
    marketSpotPerOunce: Number(result.data?.marketSpotPerOunce ?? 0),
    marketSnapshotAt: result.data?.marketSnapshotAt ?? null,
    marketSource: result.data?.marketSource ?? null
  }));

  return {
    estimatedQuote: Number(lineItems.reduce((sum, item) => sum + Number(item.estimatedQuote || 0), 0).toFixed(2)),
    lineItems
  };
}

function getFriendlyEstimateFailure(error) {
  const message = getFunctionErrorMessage(error);

  if (/No payout factor is configured for/i.test(message)) {
    return "Live rates for one or more selected metals are not configured yet. Add the missing Supabase payout-factor secret for that metal and try again.";
  }

  if (/No cached .* price is available/i.test(message)) {
    return "Live market prices are not cached yet for one or more selected metals. Refresh the market cache and try again.";
  }

  return "The live combined estimate is temporarily unavailable. You can still save the draft and submit for manual review.";
}

function scheduleEstimateRefresh() {
  saveDraft();

  if (state.estimateTimer) {
    window.clearTimeout(state.estimateTimer);
  }

  if (!state.supabase) {
    state.lineItemsById.clear();
    state.totalEstimate = 0;
    const items = collectItems();
    renderSummaryList(items);
    renderInlineItemEstimates(items);
    setBuilderEstimateDisplay(
      0,
      "The live combined estimate will appear here once the office connection is enabled."
    );
    return;
  }

  setEstimateLoading();

  state.estimateTimer = window.setTimeout(() => {
    refreshEstimate().catch((error) => console.error(error));
  }, 350);
}

async function refreshEstimate() {
  const items = collectItems();
  const completeItems = items.filter(isCompleteItem);
  const incompleteCount = items.length - completeItems.length;
  const requestSequence = ++state.estimateRequestSequence;

  if (!completeItems.length) {
    state.lineItemsById.clear();
    state.totalEstimate = 0;
    renderSummaryList(items);
    renderInlineItemEstimates(items);
    setBuilderEstimateDisplay(
      0,
      "Add at least one complete line item to see the combined estimated payout."
    );
    return null;
  }

  if (requestSequence !== state.estimateRequestSequence) {
    return null;
  }

  let estimateResult = null;

  try {
    estimateResult = await estimateItemsBatch(completeItems);
  } catch (batchError) {
    try {
      estimateResult = await estimateItemsIndividually(completeItems);
    } catch (fallbackError) {
      state.lineItemsById.clear();
      state.totalEstimate = 0;
      renderSummaryList(items);
      renderInlineItemEstimates(items);
      setBuilderEstimateDisplay(0, getFriendlyEstimateFailure(fallbackError));
      console.error(batchError);
      console.error(fallbackError);
      return null;
    }
  }

  if (requestSequence !== state.estimateRequestSequence || !estimateResult) {
    return null;
  }

  state.lineItemsById = new Map(
    completeItems.map((item, index) => [item.id, estimateResult.lineItems?.[index] ?? null])
  );
  state.totalEstimate = Number(estimateResult.estimatedQuote || 0);
  renderSummaryList(items);
  renderInlineItemEstimates(items);

  const summaryMessage = incompleteCount > 0
    ? `Complete the remaining ${incompleteCount} item${incompleteCount === 1 ? "" : "s"} to finalize the combined estimate. Current total for finished items: ${formatCurrency(state.totalEstimate)}.`
    : `Based on current market conditions, the combined estimated amount you would receive is ${formatCurrency(state.totalEstimate)}. Submit promptly to help lock in this estimate before prices change.`;

  setBuilderEstimateDisplay(state.totalEstimate, summaryMessage);
  return {
    items,
    completeItems,
    estimatedQuote: state.totalEstimate
  };
}

function appendBuilderItem() {
  const items = collectItems();
  items.push(createEmptyItem());
  renderItems(items);
  saveDraft();
  syncRequestButtonState();
}

function clearBuilderDraft() {
  clearDraftStorage();
  renderItems([createEmptyItem()]);
  builderForm.reset();
  settlementPreferenceField.value = "Undecided";
  syncSettlementFieldVisibility();
  syncRequestButtonState();
  state.lineItemsById.clear();
  state.totalEstimate = 0;
  const items = collectItems();
  renderSummaryList(items);
  renderInlineItemEstimates(items);
  setBuilderEstimateDisplay(
    0,
    "Add each item in the list to see the combined estimated amount the client would receive if the submitted details are confirmed on review."
  );
  setDraftState("Saved draft cleared from this browser.");
}

function buildSubmissionSummary(items) {
  const count = items.length;
  const descriptions = items
    .map((item) => item.description)
    .filter(Boolean)
    .slice(0, 3);
  const uniqueMetals = Array.from(new Set(items.map((item) => item.metalType)));
  const lotLabel = uniqueMetals.length === 1
    ? `${count}-item ${getMetalLabel(uniqueMetals[0]).toLowerCase()} lot`
    : `${count}-item mixed precious-metals lot`;

  if (!descriptions.length) {
    return lotLabel;
  }

  return `${lotLabel}: ${descriptions.join(", ")}${count > descriptions.length ? ", and more" : ""}`;
}

function buildIntakePayload(items) {
  const totalWeight = items.reduce((sum, item) => sum + Number(item.weightGrams || 0), 0);
  const uniqueMetals = Array.from(new Set(items.map((item) => item.metalType)));
  const singleItem = items.length === 1 ? items[0] : null;
  const preferredSettlement = String(settlementPreferenceField?.value ?? "Undecided");
  const bankRoutingNumber = normalizeDigits(bankRoutingNumberInput?.value ?? "");
  const bankAccountNumber = normalizeDigits(bankAccountNumberInput?.value ?? "");

  return {
    full_name: String(document.getElementById("builder-client-name")?.value ?? "").trim(),
    email: String(document.getElementById("builder-client-email")?.value ?? "").trim(),
    phone: String(document.getElementById("builder-client-phone")?.value ?? "").trim(),
    address_line1: String(document.getElementById("builder-address-line1")?.value ?? "").trim(),
    city: String(document.getElementById("builder-address-city")?.value ?? "").trim(),
    state: String(document.getElementById("builder-address-state")?.value ?? "").trim(),
    postal_code: String(document.getElementById("builder-address-postal-code")?.value ?? "").trim(),
    preferred_settlement: preferredSettlement,
    bank_routing_number: settlementRequiresBanking(preferredSettlement) ? bankRoutingNumber : null,
    bank_account_number: settlementRequiresBanking(preferredSettlement) ? bankAccountNumber : null,
    notes: String(document.getElementById("builder-client-notes")?.value ?? "").trim() || null,
    metal_type: uniqueMetals.length === 1 ? uniqueMetals[0] : "mixed",
    item_summary: buildSubmissionSummary(items),
    claimed_karat: singleItem?.metalType === "gold" ? singleItem.karat : "mixed",
    claimed_purity: singleItem ? Number(singleItem.purity.toFixed(4)) : null,
    claimed_purity_label: singleItem ? singleItem.purityLabel : `${items.length} item mixed lot`,
    claimed_weight_grams: Number(totalWeight.toFixed(2)),
    estimated_quote: Number(state.totalEstimate.toFixed(2)),
    source: "website",
    source_page: window.location.pathname,
    submission_type: "itemized",
    itemized_items: items.map((item) => ({
      description: item.description,
      metalType: item.metalType,
      karat: item.karat,
      purity: Number(item.purity.toFixed(4)),
      purityLabel: item.purityLabel,
      weightGrams: Number(item.weightGrams.toFixed(2)),
      estimatedQuote: Number((state.lineItemsById.get(item.id)?.estimatedQuote ?? 0).toFixed(2))
    }))
  };
}

if (isConfigured()) {
  state.supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  setRequestStatus(
    `Live intake is enabled. Itemized mixed-lot requests and combined payout estimates will be stored for ${brandName}'s office review.`,
    "success"
  );
}

if (builderForm) {
  hydrateDraft();
  renderSummaryList(collectItems());
  scheduleEstimateRefresh();

  settlementPreferenceField?.addEventListener("change", () => {
    syncSettlementFieldVisibility();
    saveDraft();
  });

  builderForm.addEventListener("input", (event) => {
    const row = event.target.closest?.("[data-builder-item-id]");
    if (row && event.target.name === "metalType") {
      syncRowPurityOptions(row);
    }

    syncRequestButtonState();
    scheduleEstimateRefresh();
  });

  builderForm.addEventListener("change", (event) => {
    const row = event.target.closest?.("[data-builder-item-id]");
    if (row && event.target.name === "metalType") {
      syncRowPurityOptions(row);
    }

    syncRequestButtonState();
    scheduleEstimateRefresh();
  });

  builderForm.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-builder-item]");
    if (!removeButton) {
      return;
    }

    const itemId = removeButton.getAttribute("data-remove-builder-item");
    const remainingItems = collectItems().filter((item) => item.id !== itemId);
    renderItems(remainingItems.length ? remainingItems : [createEmptyItem()]);
    scheduleEstimateRefresh();
  });

  addBuilderItemButton?.addEventListener("click", appendBuilderItem);
  clearBuilderDraftButton?.addEventListener("click", clearBuilderDraft);

  builderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    syncSettlementFieldVisibility();

    if (!builderForm.reportValidity()) {
      setRequestStatus("Complete every required client field and item row before sending the request.", "warning");
      return;
    }

    const honeypot = String(document.getElementById("builder-website")?.value ?? "").trim();
    const items = collectItems();

    if (!items.length || items.some((item) => !isCompleteItem(item))) {
      setRequestStatus("Complete every item row before sending the itemized request.", "warning");
      return;
    }

    const preferredSettlement = String(settlementPreferenceField?.value ?? "Undecided");
    const bankRoutingNumber = normalizeDigits(bankRoutingNumberInput?.value ?? "");
    const bankAccountNumber = normalizeDigits(bankAccountNumberInput?.value ?? "");

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

    const estimateContext = await refreshEstimate();
    if (!estimateContext || state.totalEstimate <= 0) {
      setRequestStatus("The combined estimate could not be prepared. Please wait a moment and try again.", "warning");
      return;
    }

    if (honeypot) {
      setRequestStatus("Request received. If the submission is a fit, the private office will follow up shortly.", "success");
      clearBuilderDraft();
      return;
    }

    if (!state.supabase) {
      setRequestStatus("Private-review intake is not connected yet. Add your Supabase project URL and anon key in js/site-config.js to enable live submissions.", "warning");
      return;
    }

    builderRequestButton?.setAttribute("disabled", "disabled");
    if (builderRequestButton) {
      builderRequestButton.dataset.submitting = "true";
      builderRequestButton.textContent = "Sending...";
    }

    const payload = buildIntakePayload(items);
    const { error } = await state.supabase
      .from("intake_requests")
      .insert(payload);

    builderRequestButton?.removeAttribute("disabled");
    if (builderRequestButton) {
      delete builderRequestButton.dataset.submitting;
      builderRequestButton.textContent = "Send itemized request";
    }
    syncRequestButtonState();

    if (error) {
      setRequestStatus(
        "The itemized request could not be saved. Confirm the intake_requests table and insert policy are in Supabase, then try again.",
        "warning"
      );
      console.error(error);
      return;
    }

    setRequestStatus(
      `${brandName} has received the itemized request. If this client later signs into the portal with the same email address, the submission can appear there automatically as a submitted file.`,
      "success"
    );
    clearDraftStorage();
    renderItems([createEmptyItem()]);
    builderForm.reset();
    settlementPreferenceField.value = "Undecided";
    syncSettlementFieldVisibility();
    syncRequestButtonState();
    state.lineItemsById.clear();
    state.totalEstimate = 0;
    const resetItems = collectItems();
    renderSummaryList(resetItems);
    renderInlineItemEstimates(resetItems);
    setBuilderEstimateDisplay(
      0,
      "Add each item in the list to see the combined estimated amount the client would receive if the submitted details are confirmed on review."
    );
    setDraftState("Saved draft cleared after successful submission.");
  });
}

syncSettlementFieldVisibility();
syncRequestButtonState();
initRevealAnimations();
