import { siteConfig, applySiteChrome, initRevealAnimations } from "./site-shell.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { formatClaimSummary } from "./metals.js";

const config = siteConfig;
const supabaseConfig = config.supabase ?? {};
const brandName = config.brand?.name ?? "Montford Reserve Metals";

applySiteChrome();

const portalBanner = document.getElementById("portal-status-banner");
const authCard = document.getElementById("auth-card");
const magicLinkForm = document.getElementById("magic-link-form");
const dashboardGrid = document.getElementById("dashboard-grid");
const emptyState = document.getElementById("empty-state");
const quoteList = document.getElementById("quote-list");
const profileGrid = document.getElementById("profile-grid");
const profileName = document.getElementById("profile-name");
const profileMeta = document.getElementById("profile-meta");
const signOutButton = document.getElementById("sign-out-button");

const portalState = {
  supabase: null,
  user: null,
  quotes: [],
  expandedQuoteId: null
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric"
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

const timelineSteps = [
  "submitted",
  "awaiting_shipment",
  "in_transit",
  "received",
  "inspection_complete",
  "offer_sent",
  "accepted",
  "paid",
  "returned"
];

const stepLabels = {
  submitted: "Quote submitted",
  awaiting_shipment: "Awaiting shipment",
  in_transit: "Shipment in transit",
  received: "Package received",
  inspection_complete: "Inspection complete",
  offer_sent: "Final offer sent",
  accepted: "Offer accepted",
  paid: "Payment sent",
  returned: "Items returned"
};

const authenticityLabels = {
  pending: "Pending review",
  verified: "Verified",
  adjusted: "Adjusted after testing",
  counterfeit: "Not authentic"
};

const demoProfile = {
  full_name: "Sample Client",
  email: "client@example.com",
  phone: "(555) 555-0101",
  address_line1: "12 East 74th Street",
  city: "Middleburg",
  state: "Virginia",
  postal_code: "20117"
};

const demoQuotes = [
  {
    id: "demo-1",
    reference_code: "MRM-D9F21A0C",
    item_summary: "Estate bracelet, cufflinks, and mixed gold chains",
    claimed_karat: "14K",
    claimed_weight_grams: 68.4,
    estimated_quote: 3590,
    status: "in_transit",
    status_detail: "Tracking has been uploaded and the shipment is now in transit to the office.",
    submitted_at: "2026-03-22T16:00:00Z",
    authenticity_verdict: "pending",
    address_line1: "12 East 74th Street",
    city: "Middleburg",
    state: "Virginia",
    postal_code: "20117",
    preferred_settlement: "Undecided",
    bank_routing_number: null,
    bank_account_number: null,
    shipments: [
      {
        id: "demo-shipment-1",
        carrier: "FedEx",
        tracking_number: "794938503019",
        status: "in_transit",
        customer_shipping_cost: 28.75,
        shipped_at: "2026-03-24T13:15:00Z",
        receipt_object_path: null,
        received_at: null
      }
    ],
    offers: [],
    payouts: []
  },
  {
    id: "demo-2",
    reference_code: "MRM-45C829D1",
    item_summary: "Gold bullion and sovereign coin case",
    claimed_karat: "24K",
    claimed_weight_grams: 31.1,
    estimated_quote: 2792,
    status: "offer_sent",
    status_detail: "A final offer has been issued and is awaiting response.",
    submitted_at: "2026-03-17T11:30:00Z",
    tested_karat: "24K",
    tested_weight_grams: 31.1,
    authenticity_verdict: "verified",
    address_line1: "12 East 74th Street",
    city: "Middleburg",
    state: "Virginia",
    postal_code: "20117",
    preferred_settlement: "Check",
    bank_routing_number: null,
    bank_account_number: null,
    shipments: [
      {
        id: "demo-shipment-2",
        carrier: "UPS",
        tracking_number: "1Z19AE450357",
        status: "received",
        customer_shipping_cost: 24.1,
        shipped_at: "2026-03-18T14:20:00Z",
        receipt_object_path: null,
        received_at: "2026-03-19T10:15:00Z"
      }
    ],
    offers: [
      {
        id: "demo-offer-1",
        final_offer: 2915,
        shipping_reimbursement_amount: 24.1,
        notes: "Includes reimbursement for outbound insured shipping.",
        sent_at: "2026-03-20T15:45:00Z",
        expires_at: null,
        accepted_at: null,
        declined_at: null
      }
    ],
    payouts: []
  }
];

function showBanner(message, tone = "warning") {
  portalBanner.textContent = message;
  portalBanner.className = `status-banner ${tone}`;
}

function describePortalLoadError(error) {
  const message = error?.message || String(error || "");

  if (/relation .* does not exist/i.test(message) || /could not find the table/i.test(message)) {
    return "The portal sign-in worked, but the database schema is incomplete. Run the latest supabase/schema.sql in Supabase.";
  }

  if (/claim_portal_intake_requests|submit_client_shipment|respond_to_offer|submit_return_label|submit_settlement_instructions/i.test(message) || /could not find the function/i.test(message)) {
    return "The portal sign-in worked, but the latest portal workflow functions are missing. Re-run the latest supabase/schema.sql in Supabase.";
  }

  if (/row-level security/i.test(message) || /permission denied/i.test(message)) {
    return "The portal sign-in worked, but the current RLS or Storage policies are blocking access. Re-run the latest supabase/schema.sql.";
  }

  if (/invalid input syntax for type uuid/i.test(message)) {
    return "The portal sign-in worked, but the linked client records are not attached to a valid Supabase user id yet.";
  }

  return "The portal connected, but records could not be loaded. Check the browser console and confirm the latest schema is installed.";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "Not yet available";
}

function formatDateTime(value) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not yet available";
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function normalizeDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function settlementRequiresBanking(method) {
  return ["Bank wire", "ACH"].includes(String(method || "").trim());
}

function normalizeSettlementMethod(value) {
  const method = String(value || "").trim();
  return ["Bank wire", "ACH", "Check", "Undecided"].includes(method) ? method : "Undecided";
}

function maskNumericTail(value, visibleCount = 4) {
  const digits = normalizeDigits(value);
  if (!digits) {
    return "Not yet provided";
  }

  if (digits.length <= visibleCount) {
    return digits;
  }

  return `${"*".repeat(Math.max(digits.length - visibleCount, 0))}${digits.slice(-visibleCount)}`;
}

function formatMailingAddress(record) {
  return [
    record?.address_line1,
    [record?.city, record?.state].filter(Boolean).join(", "),
    record?.postal_code
  ].filter(Boolean).join(" ");
}

function getPurityDisplayLabel(record, prefix = "Tested purity") {
  if (record?.tested_karat) {
    return `${prefix} ${record.tested_karat}`;
  }

  if (record?.tested_purity_label) {
    return `${prefix} ${record.tested_purity_label}`;
  }

  return null;
}

function buildSubmittedItemsMarkup(record) {
  const itemizedItems = Array.isArray(record?.itemized_items) ? record.itemized_items.filter(Boolean) : [];
  if (!itemizedItems.length) {
    return "";
  }

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Submitted items</div>
      <div class="builder-summary-list builder-summary-list-embedded">
        ${itemizedItems.map((item, index) => `
          <article class="builder-summary-row">
            <div>
              <strong>${escapeHtml(`${index + 1}. ${item.description || item.label || "Untitled item"}`)}</strong>
              <p>${escapeHtml(`${item.purityLabel || item.purity_label || "Purity pending"} · ${Number(item.weightGrams || item.weight_grams || 0).toFixed(2)}g`)}</p>
            </div>
            <span>${escapeHtml(formatCurrency(item.estimatedQuote || item.estimated_quote || 0))}</span>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function getSettlementState(record) {
  const method = normalizeSettlementMethod(record?.preferred_settlement);
  const bankRoutingNumber = normalizeDigits(record?.bank_routing_number);
  const bankAccountNumber = normalizeDigits(record?.bank_account_number);
  const mailingAddress = formatMailingAddress(record);
  const needsBanking = settlementRequiresBanking(method);

  if (method === "Undecided") {
    return {
      method,
      needsBanking,
      mailingAddress,
      bankRoutingNumber,
      bankAccountNumber,
      ready: false,
      statusCopy: "Choose how you want to receive payment before the office sends settlement."
    };
  }

  if (method === "Check") {
    return {
      method,
      needsBanking,
      mailingAddress,
      bankRoutingNumber: "",
      bankAccountNumber: "",
      ready: Boolean(mailingAddress),
      statusCopy: mailingAddress
        ? `A mailed check will be sent to ${mailingAddress}.`
        : "A mailing address is required before a check can be issued."
    };
  }

  const hasBanking = bankRoutingNumber.length === 9 && bankAccountNumber.length >= 4;
  return {
    method,
    needsBanking,
    mailingAddress,
    bankRoutingNumber,
    bankAccountNumber,
    ready: hasBanking,
    statusCopy: hasBanking
      ? `${method} details are on file. Routing ${maskNumericTail(bankRoutingNumber)} · Account ${maskNumericTail(bankAccountNumber)}`
      : `Choose ${method} details and provide routing plus account numbers before the office sends payment.`
  };
}

function normalizeNumberInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPdfFile(file) {
  if (!file) {
    return false;
  }

  const fileName = String(file.name || "").toLowerCase();
  return file.type === "application/pdf" || fileName.endsWith(".pdf");
}

function normalizeArray(records) {
  return Array.isArray(records) ? records : [];
}

function latestByDate(records, keyCandidates) {
  const keys = Array.isArray(keyCandidates) ? keyCandidates : [keyCandidates];

  return normalizeArray(records)
    .slice()
    .sort((left, right) => {
      const leftValue = keys.map((key) => left?.[key]).find(Boolean) ?? "";
      const rightValue = keys.map((key) => right?.[key]).find(Boolean) ?? "";
      return String(rightValue).localeCompare(String(leftValue));
    })[0] ?? null;
}

function findQuoteById(quoteId) {
  return portalState.quotes.find((quote) => quote.id === quoteId) ?? null;
}

function renderProfile(profile) {
  profileName.textContent = profile.full_name || "Private client overview";
  profileMeta.textContent = `${profile.email || "No email on file"}${profile.phone ? ` - ${profile.phone}` : ""}`;
  const mailingAddress = formatMailingAddress(profile);

  profileGrid.innerHTML = `
    <div>
      <dt>Client</dt>
      <dd>${escapeHtml(profile.full_name || "Not provided")}</dd>
    </div>
    <div>
      <dt>Email</dt>
      <dd>${escapeHtml(profile.email || "Not provided")}</dd>
    </div>
    <div>
      <dt>Phone</dt>
      <dd>${escapeHtml(profile.phone || "Not provided")}</dd>
    </div>
    <div>
      <dt>Location</dt>
      <dd>${escapeHtml([profile.city, profile.state].filter(Boolean).join(", ") || "Not provided")}</dd>
    </div>
    <div class="detail-list-wide">
      <dt>Mailing address</dt>
      <dd>${escapeHtml(mailingAddress || "Not provided")}</dd>
    </div>
  `;
}

function renderTimeline(status) {
  const activeIndex = Math.max(timelineSteps.indexOf(status), 0);

  return timelineSteps.map((step, index) => {
    const stateClass = index < activeIndex
      ? "timeline-step complete"
      : index === activeIndex
        ? "timeline-step active"
        : "timeline-step";
    return `<span class="${stateClass}">${escapeHtml(stepLabels[step])}</span>`;
  }).join("");
}

function buildInspectionMarkup(quote) {
  const hasInspectionData = Boolean(
    quote.tested_karat ||
    quote.tested_purity_label ||
    quote.tested_weight_grams ||
    quote.inspection_notes ||
    (quote.authenticity_verdict && quote.authenticity_verdict !== "pending") ||
    ["inspection_complete", "offer_sent", "accepted", "paid", "returned"].includes(quote.status)
  );

  if (!hasInspectionData) {
    return "";
  }

  const details = [
    quote.authenticity_verdict ? `Result ${authenticityLabels[quote.authenticity_verdict] || quote.authenticity_verdict}` : null,
    getPurityDisplayLabel(quote),
    quote.tested_weight_grams ? `Tested weight ${Number(quote.tested_weight_grams).toFixed(2)}g` : null,
    quote.return_deadline_at ? `Counterfeit hold deadline ${formatDate(quote.return_deadline_at)}` : null
  ].filter(Boolean);

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Inspection details</div>
      <div class="quote-submeta">${details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      ${quote.inspection_notes ? `<p class="quote-card-note">${escapeHtml(quote.inspection_notes)}</p>` : ""}
    </section>
  `;
}

function buildShipmentSummaryMarkup(shipment) {
  if (!shipment) {
    return "";
  }

  const details = [
    shipment.carrier || "Carrier not provided",
    shipment.tracking_number ? `Tracking ${shipment.tracking_number}` : "Tracking pending",
    shipment.customer_shipping_cost != null ? `Shipping paid ${formatCurrency(shipment.customer_shipping_cost)}` : null,
    shipment.shipped_at ? `Shipped ${formatDateTime(shipment.shipped_at)}` : null,
    shipment.received_at ? `Received ${formatDateTime(shipment.received_at)}` : null
  ].filter(Boolean);

  const receiptButton = shipment.receipt_object_path
    ? `<button class="button button-secondary portal-inline-button" type="button" data-storage-bucket="shipment-receipts" data-storage-path="${escapeHtml(shipment.receipt_object_path)}">View receipt</button>`
    : "";

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Shipment</div>
      <div class="quote-submeta">${details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      ${receiptButton ? `<div class="quote-card-actions">${receiptButton}</div>` : ""}
    </section>
  `;
}

function buildShipmentFormMarkup(quote, shipment) {
  const shouldShowForm = ["submitted", "awaiting_shipment"].includes(quote.status);
  if (!shouldShowForm) {
    return "";
  }

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Ship to office</div>
      <p class="quote-card-note">
        Customers pay outbound shipping initially. Upload the tracking number, the amount paid, and a receipt image.
        If the item passes inspection, that shipping cost can be reimbursed in the final offer.
      </p>
      <form class="portal-action-form portal-shipment-form" data-quote-id="${escapeHtml(quote.id)}">
        <div class="portal-action-grid">
          <label>
            Carrier
            <input name="carrier" type="text" value="${escapeHtml(shipment?.carrier || "")}" placeholder="UPS, FedEx, USPS">
          </label>

          <label>
            Tracking number
            <input name="tracking_number" type="text" value="${escapeHtml(shipment?.tracking_number || "")}" required>
          </label>

          <label>
            Amount paid for shipping
            <input name="shipping_cost" type="number" min="0" step="0.01" value="${shipment?.customer_shipping_cost != null ? escapeHtml(Number(shipment.customer_shipping_cost).toFixed(2)) : ""}" required>
          </label>

          <label>
            Receipt image or PDF
            <input name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>
          </label>
        </div>
        <div class="quote-card-actions">
          <button class="button button-primary" type="submit">Mark shipment in transit</button>
        </div>
      </form>
    </section>
  `;
}

function buildOfferMarkup(quote, offer) {
  if (!offer) {
    return "";
  }

  const reimbursementAmount = Number(offer.shipping_reimbursement_amount || 0);
  const finalOfferAmount = Number(offer.final_offer || 0);
  const totalOfferAmount = finalOfferAmount + reimbursementAmount;

  const details = [
    offer.sent_at ? `Sent ${formatDateTime(offer.sent_at)}` : null,
    offer.accepted_at ? `Accepted ${formatDateTime(offer.accepted_at)}` : null,
    offer.declined_at ? `Declined ${formatDateTime(offer.declined_at)}` : null
  ].filter(Boolean);

  const canRespond = quote.status === "offer_sent" && !offer.accepted_at && !offer.declined_at;

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Final offer</div>
      <div class="offer-breakdown">
        <div class="offer-breakdown-row">
          <span>Final offer</span>
          <strong>${escapeHtml(formatCurrency(finalOfferAmount))}</strong>
        </div>
        <div class="offer-breakdown-row">
          <span>Includes shipping reimbursement</span>
          <strong>${escapeHtml(formatCurrency(reimbursementAmount))}</strong>
        </div>
      </div>
      <div class="offer-total-card" aria-label="Total amount including final offer and shipping reimbursement">
        <span class="offer-total-label">Total amount including final offer and shipping</span>
        <strong class="offer-total-amount">${escapeHtml(formatCurrency(totalOfferAmount))}</strong>
      </div>
      <div class="quote-submeta">${details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      ${offer.notes ? `<p class="quote-card-note">${escapeHtml(offer.notes)}</p>` : ""}
      ${canRespond ? `
        <div class="quote-card-actions">
          <button class="button button-primary portal-inline-button" type="button" data-offer-response="accepted" data-quote-id="${escapeHtml(quote.id)}">Accept final offer</button>
          <button class="button button-secondary portal-inline-button" type="button" data-offer-response="declined" data-quote-id="${escapeHtml(quote.id)}">Decline and arrange return</button>
        </div>
      ` : ""}
    </section>
  `;
}

function buildSettlementMarkup(quote) {
  if (!["offer_sent", "accepted"].includes(quote.status)) {
    return "";
  }

  const settlement = getSettlementState(quote);
  const requiresBanking = settlement.needsBanking;
  const mailingAddress = settlement.mailingAddress || "No mailing address is currently on file.";
  const helperCopy = quote.status === "accepted"
    ? "Payment cannot be sent until this step is complete."
    : "You can set the payout method now so the office is ready once the final offer is accepted.";

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Settlement instructions</div>
      <div class="settlement-summary-card">
        <strong>${escapeHtml(settlement.method === "Undecided" ? "No payout method selected yet" : settlement.method)}</strong>
        <p class="quote-card-note">${escapeHtml(settlement.statusCopy)}</p>
      </div>
      <form class="portal-action-form portal-settlement-form" data-quote-id="${escapeHtml(quote.id)}">
        <div class="portal-action-grid">
          <label class="form-span-2">
            Settlement method
            <select name="preferred_settlement" required>
              <option value=""${settlement.method === "Undecided" ? " selected" : ""} disabled>Select a payout method</option>
              ${["Bank wire", "ACH", "Check"].map((value) => {
                const selected = settlement.method === value ? " selected" : "";
                return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
              }).join("")}
            </select>
          </label>

          <div class="settlement-bank-fields form-span-2${requiresBanking ? "" : " hidden"}" data-settlement-bank-fields>
            <label>
              Routing number
              <input
                name="bank_routing_number"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                value="${escapeHtml(settlement.bankRoutingNumber || "")}"
                ${requiresBanking ? "required" : ""}
              >
            </label>

            <label>
              Account number
              <input
                name="bank_account_number"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                value="${escapeHtml(settlement.bankAccountNumber || "")}"
                ${requiresBanking ? "required" : ""}
              >
            </label>
          </div>
        </div>
        <p class="quote-card-note">
          ${escapeHtml(helperCopy)}
          ${requiresBanking
            ? " Enter routing and account numbers exactly as they should be used for ACH or bank-wire settlement."
            : ` Checks will be mailed to the address on file: ${mailingAddress}`}
        </p>
        <div class="quote-card-actions">
          <button class="button button-primary" type="submit">${escapeHtml(settlement.ready ? "Update settlement instructions" : "Save settlement instructions")}</button>
        </div>
      </form>
    </section>
  `;
}

function buildReturnLabelMarkup(quote, offer) {
  if (quote.status !== "returned") {
    return "";
  }

  const canAcceptAfterDecline = Boolean(offer?.declined_at && !offer?.accepted_at);
  const totalOfferAmount = Number(offer?.final_offer || 0) + Number(offer?.shipping_reimbursement_amount || 0);

  const details = [
    quote.return_label_due_at ? `Upload return label by ${formatDate(quote.return_label_due_at)}` : null,
    quote.return_label_uploaded_at ? `Label uploaded ${formatDateTime(quote.return_label_uploaded_at)}` : null
  ].filter(Boolean);

  const labelButton = quote.return_label_object_path
    ? `<button class="button button-secondary portal-inline-button" type="button" data-storage-bucket="return-labels" data-storage-path="${escapeHtml(quote.return_label_object_path)}">View uploaded return label</button>`
    : "";

  const uploadForm = !quote.return_label_object_path ? `
    <form class="portal-action-form portal-return-label-form" data-quote-id="${escapeHtml(quote.id)}">
      <div class="portal-action-grid">
        <label class="form-span-2">
          4x6 return label PDF
          <input name="return_label_file" type="file" accept="application/pdf,.pdf" required>
        </label>
      </div>
      <p class="quote-card-note">
        If you want your items returned, upload a prepaid 4x6 PDF shipping label within 30 days. If no usable label is received in time, the items may be forfeited.
      </p>
      <div class="quote-card-actions">
        <button class="button button-primary" type="submit">Upload return label</button>
      </div>
    </form>
  ` : `
    <p class="quote-card-note">
      Your prepaid return label is on file. The office will review it and arrange shipment back to you.
    </p>
  `;

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Return label</div>
      <div class="quote-submeta">${details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      ${canAcceptAfterDecline ? `
        <div class="offer-recovery-callout">
          <p class="offer-recovery-title">Changed your mind?</p>
          <p class="offer-recovery-copy">If you would rather proceed with the payout, you can still accept the final offer instead of uploading a return label.</p>
          <div class="offer-recovery-actions">
            <button class="button button-recovery portal-inline-button" type="button" data-offer-response="accepted" data-quote-id="${escapeHtml(quote.id)}">Accept final offer instead</button>
            <div class="offer-recovery-amount-block">
              <span class="offer-recovery-amount-label">Total payout</span>
              <strong class="offer-recovery-amount">${escapeHtml(formatCurrency(totalOfferAmount))}</strong>
            </div>
          </div>
        </div>
      ` : ""}
      ${labelButton ? `<div class="quote-card-actions">${labelButton}</div>` : ""}
      ${uploadForm}
    </section>
  `;
}

function buildPayoutMarkup(payout) {
  if (!payout) {
    return "";
  }

  const details = [
    `Amount ${formatCurrency(payout.amount)}`,
    payout.method ? `Method ${payout.method}` : null,
    payout.status ? `Payout ${payout.status}` : null,
    payout.reference_id ? `Ref ${payout.reference_id}` : null,
    payout.paid_at ? `Paid ${formatDateTime(payout.paid_at)}` : null
  ].filter(Boolean);

  return `
    <section class="quote-card-section">
      <div class="dashboard-label">Settlement</div>
      <div class="quote-submeta">${details.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </section>
  `;
}

function getOfferTotalAmount(offer) {
  return Number(offer?.final_offer || 0) + Number(offer?.shipping_reimbursement_amount || 0);
}

function getPortalNextStepText(quote, shipment, offer, payout) {
  const settlement = getSettlementState(quote);

  switch (quote.status) {
    case "submitted":
      return "Await office review and shipment instructions.";
    case "awaiting_shipment":
      return shipment?.tracking_number
        ? "Shipment details are on file."
        : "Upload tracking, shipping cost, and your receipt.";
    case "in_transit":
      return "Your package is on the way to the office.";
    case "received":
      return "The office is inspecting the shipment now.";
    case "inspection_complete":
      return quote.authenticity_verdict === "counterfeit"
        ? "Review the inspection notes and return instructions."
        : "Inspection is complete. Await the final offer.";
    case "offer_sent":
      if (offer?.accepted_at) {
        return settlement.ready
          ? "Offer accepted. Await payout."
          : "Offer accepted. Choose your payout method to avoid delays.";
      }

      if (offer?.declined_at) {
        return "Upload a return label or accept the payout instead.";
      }

      return settlement.ready
        ? "Review the final offer and choose how to proceed."
        : "Review the final offer and choose how you want payment handled.";
    case "accepted":
      if (payout?.paid_at) {
        return "Payment has been sent.";
      }

      return settlement.ready
        ? "Payment is pending office settlement."
        : "Choose your settlement method before payment can be sent.";
    case "paid":
      return "Settlement has been completed.";
    case "returned":
      return quote.return_label_object_path
        ? "Return label received. The office will arrange shipment back to you."
        : "Upload a prepaid 4x6 PDF return label within 30 days.";
    default:
      return "Portal updates will appear here as the case progresses.";
  }
}

function buildPortalAccordionPreview(quote, shipment, offer, payout) {
  const previewItems = [
    {
      label: "Status",
      value: stepLabels[quote.status] || "Status pending"
    }
  ];

  if (offer && ["offer_sent", "accepted", "paid", "returned"].includes(quote.status)) {
    previewItems.push({
      label: "Total",
      value: formatCurrency(getOfferTotalAmount(offer))
    });
  } else if (payout?.paid_at) {
    previewItems.push({
      label: "Payout",
      value: formatCurrency(Number(payout.amount || 0))
    });
  } else if (shipment?.tracking_number) {
    previewItems.push({
      label: "Tracking",
      value: shipment.tracking_number
    });
  } else {
    previewItems.push({
      label: "Estimate",
      value: formatCurrency(Number(quote.estimated_quote || 0))
    });
  }

  previewItems.push({
    label: "Next",
    value: getPortalNextStepText(quote, shipment, offer, payout)
  });

  return previewItems
    .map((item) => `<span><strong>${escapeHtml(item.label)}:</strong> ${escapeHtml(item.value)}</span>`)
    .join("");
}

function renderQuotes(quotes) {
  portalState.quotes = quotes;
  const availableQuoteIds = new Set(quotes.map((quote) => quote.id));

  if (portalState.expandedQuoteId && !availableQuoteIds.has(portalState.expandedQuoteId)) {
    portalState.expandedQuoteId = null;
  }

  if (!quotes.length) {
    portalState.expandedQuoteId = null;
    quoteList.innerHTML = `
      <article class="empty-state">
        <h3>No active submissions</h3>
        <p>Once a matching website request is claimed for this email, or a staff-created file is opened, it will appear here automatically.</p>
      </article>
    `;
    return;
  }

  quoteList.innerHTML = quotes.map((quote) => {
    const shipment = latestByDate(quote.shipments, ["received_at", "shipped_at", "receipt_uploaded_at", "created_at"]);
    const offer = latestByDate(quote.offers, ["sent_at", "accepted_at", "declined_at"]);
    const payout = latestByDate(quote.payouts, ["paid_at", "created_at"]);

    const metaItems = [
      formatClaimSummary(quote),
      `Submitted ${formatDate(quote.submitted_at)}`,
      `Ref ${quote.reference_code}`
    ];
    const isExpanded = portalState.expandedQuoteId === quote.id;

    const subMeta = [
      `Estimate ${formatCurrency(Number(quote.estimated_quote || 0))}`
    ];

    if (shipment?.tracking_number) {
      subMeta.push(`Tracking ${shipment.tracking_number}`);
    }

    if (offer?.final_offer) {
      subMeta.push(`Final offer ${formatCurrency(Number(offer.final_offer))}`);
    }

    if (payout?.paid_at) {
      subMeta.push(`Payment sent ${formatDate(payout.paid_at)}`);
    }

    return `
      <article class="quote-card quote-card-accordion case-accordion${isExpanded ? " is-open" : ""}">
        <button class="case-accordion-toggle" type="button" data-quote-toggle="${escapeHtml(quote.id)}" aria-expanded="${isExpanded ? "true" : "false"}" aria-controls="portal-case-${escapeHtml(quote.id)}">
          <div class="case-accordion-top">
            <div class="case-accordion-copy">
              <strong>${escapeHtml(quote.item_summary || "Precious-metals submission")}</strong>
              <div class="quote-meta">${metaItems.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
            </div>
            <div class="case-accordion-side">
              <span class="timeline-step active">${escapeHtml(stepLabels[quote.status] || "Status pending")}</span>
              <span class="case-accordion-caret" aria-hidden="true">&#8964;</span>
            </div>
          </div>
          <div class="case-accordion-preview">${buildPortalAccordionPreview(quote, shipment, offer, payout)}</div>
        </button>

        ${isExpanded ? `
          <div class="case-accordion-body" id="portal-case-${escapeHtml(quote.id)}">
            <section class="quote-card-section">
              <div class="dashboard-label">Case update</div>
              <div class="quote-submeta">${subMeta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
              <p class="quote-card-note">${escapeHtml(quote.status_detail || "Your case is currently being reviewed.")}</p>
            </section>
            ${buildSubmittedItemsMarkup(quote)}
            ${buildShipmentSummaryMarkup(shipment)}
            ${buildShipmentFormMarkup(quote, shipment)}
            ${buildInspectionMarkup(quote)}
            ${buildOfferMarkup(quote, offer)}
            ${buildSettlementMarkup(quote)}
            ${buildReturnLabelMarkup(quote, offer)}
            ${buildPayoutMarkup(payout)}
            <div class="timeline">${renderTimeline(quote.status)}</div>
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}

function showDashboard(profile, quotes) {
  renderProfile(profile);
  renderQuotes(quotes);
  emptyState.classList.add("hidden");
  dashboardGrid.classList.remove("hidden");
}

function showLoggedOut() {
  portalState.user = null;
  portalState.quotes = [];
  portalState.expandedQuoteId = null;

  profileName.textContent = "Private client overview";
  profileMeta.textContent = "Portal data will appear here after secure sign-in.";
  dashboardGrid.classList.add("hidden");
  emptyState.classList.remove("hidden");
  signOutButton.classList.add("hidden");
  quoteList.innerHTML = "";
}

function renderDemoMode() {
  showBanner(
    "Preview mode is active. Add your Supabase URL and anon key in js/site-config.js to enable live private-client login.",
    "warning"
  );
  authCard.classList.add("hidden");
  signOutButton.classList.add("hidden");
  showDashboard(demoProfile, demoQuotes);
}

async function loadDashboard(supabase, user) {
  const profileResponse = await supabase
    .from("profiles")
    .select("full_name, email, phone, address_line1, city, state, postal_code")
    .eq("id", user.id)
    .maybeSingle();

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  const quotesResponse = await supabase
    .from("quotes")
    .select(`
      id,
      reference_code,
      item_summary,
      metal_type,
      claimed_karat,
      claimed_purity,
      claimed_purity_label,
      claimed_weight_grams,
      estimated_quote,
      submission_type,
      itemized_items,
      address_line1,
      city,
      state,
      postal_code,
      preferred_settlement,
      bank_routing_number,
      bank_account_number,
      status,
      status_detail,
      submitted_at,
      tested_karat,
      tested_purity,
      tested_purity_label,
      tested_weight_grams,
      authenticity_verdict,
      inspection_notes,
      return_deadline_at,
      return_label_object_path,
      return_label_uploaded_at,
      return_label_due_at,
      shipments (
        id,
        carrier,
        tracking_number,
        status,
        customer_shipping_cost,
        receipt_object_path,
        receipt_uploaded_at,
        shipped_at,
        received_at
      ),
      offers (
        id,
        final_offer,
        shipping_reimbursement_amount,
        notes,
        sent_at,
        expires_at,
        accepted_at,
        declined_at
      ),
      payouts (
        id,
        amount,
        method,
        status,
        reference_id,
        paid_at,
        created_at
      )
    `)
    .eq("user_id", user.id)
    .order("submitted_at", { ascending: false });

  if (quotesResponse.error) {
    throw quotesResponse.error;
  }

  const profile = profileResponse.data ?? {
    full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Customer",
    email: user.email
  };

  showDashboard(profile, quotesResponse.data ?? []);
}

async function claimPortalIntakeRequests(supabase) {
  const { data, error } = await supabase.rpc("claim_portal_intake_requests");

  if (error) {
    throw error;
  }

  return Number(data ?? 0);
}

function buildStoragePath(userId, quoteId, prefix, fileName) {
  const safeName = String(fileName || "receipt")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");

  return `${userId}/${quoteId}/${prefix}-${Date.now()}-${safeName}`;
}

async function openStorageObjectUrl(bucketName, path) {
  if (!portalState.supabase || !path || !bucketName) {
    return;
  }

  const { data, error } = await portalState.supabase
    .storage
    .from(bucketName)
    .createSignedUrl(path, 300);

  if (error) {
    throw error;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function syncPortalSettlementFormFields(form) {
  if (!form) {
    return;
  }

  const method = String(form.querySelector('select[name="preferred_settlement"]')?.value ?? "").trim();
  const requiresBanking = settlementRequiresBanking(method);
  const bankFields = form.querySelector("[data-settlement-bank-fields]");

  bankFields?.classList.toggle("hidden", !requiresBanking);

  ["bank_routing_number", "bank_account_number"].forEach((fieldName) => {
    const field = form.querySelector(`[name="${fieldName}"]`);
    if (!field) {
      return;
    }

    field.required = requiresBanking;

    if (!requiresBanking) {
      field.value = "";
    }
  });
}

async function submitShipmentForm(form) {
  if (!portalState.supabase || !portalState.user) {
    showBanner("Sign in before uploading shipment details.", "warning");
    return;
  }

  const quoteId = form.getAttribute("data-quote-id");
  if (!quoteId) {
    showBanner("The shipment could not be matched to a quote.", "warning");
    return;
  }

  const formData = new FormData(form);
  const carrier = String(formData.get("carrier") || "").trim();
  const trackingNumber = String(formData.get("tracking_number") || "").trim();
  const shippingCost = normalizeNumberInput(formData.get("shipping_cost"));
  const receiptFile = form.querySelector('input[name="receipt_file"]')?.files?.[0] ?? null;

  if (!trackingNumber || shippingCost == null || !receiptFile) {
    showBanner("Carrier, tracking, shipping amount, and a receipt file are required before the shipment can be marked in transit.", "warning");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton?.setAttribute("disabled", "disabled");
  if (submitButton) {
    submitButton.textContent = "Uploading shipment proof...";
  }

  try {
    const receiptPath = buildStoragePath(portalState.user.id, quoteId, "shipment-receipt", receiptFile.name);
    const uploadResponse = await portalState.supabase
      .storage
      .from("shipment-receipts")
      .upload(receiptPath, receiptFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: receiptFile.type || undefined
      });

    if (uploadResponse.error) {
      throw uploadResponse.error;
    }

    const shipmentResponse = await portalState.supabase.rpc("submit_client_shipment", {
      p_quote_id: quoteId,
      p_carrier: carrier || null,
      p_tracking_number: trackingNumber,
      p_shipping_cost: shippingCost,
      p_receipt_object_path: receiptPath
    });

    if (shipmentResponse.error) {
      throw shipmentResponse.error;
    }

    await loadDashboard(portalState.supabase, portalState.user);
    showBanner("Shipment details saved successfully. The file is now marked in transit.", "success");
  } catch (error) {
    showBanner(describePortalLoadError(error), "warning");
    console.error(error);
  } finally {
    submitButton?.removeAttribute("disabled");
    if (submitButton) {
      submitButton.textContent = "Mark shipment in transit";
    }
  }
}

async function submitSettlementForm(form) {
  if (!portalState.supabase || !portalState.user) {
    showBanner("Sign in before saving settlement instructions.", "warning");
    return;
  }

  const quoteId = form.getAttribute("data-quote-id");
  if (!quoteId) {
    showBanner("The settlement method could not be matched to a quote.", "warning");
    return;
  }

  const formData = new FormData(form);
  const method = String(formData.get("preferred_settlement") || "").trim();
  const bankRoutingNumber = normalizeDigits(formData.get("bank_routing_number"));
  const bankAccountNumber = normalizeDigits(formData.get("bank_account_number"));

  if (!["Bank wire", "ACH", "Check"].includes(method)) {
    showBanner("Select ACH, Bank wire, or Check before saving settlement instructions.", "warning");
    return;
  }

  if (settlementRequiresBanking(method)) {
    if (bankRoutingNumber.length !== 9) {
      showBanner("Enter a valid 9-digit routing number before saving settlement instructions.", "warning");
      form.querySelector('[name="bank_routing_number"]')?.focus();
      return;
    }

    if (bankAccountNumber.length < 4) {
      showBanner("Enter the bank account number before saving settlement instructions.", "warning");
      form.querySelector('[name="bank_account_number"]')?.focus();
      return;
    }
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton?.setAttribute("disabled", "disabled");
  if (submitButton) {
    submitButton.textContent = "Saving settlement instructions...";
  }

  try {
    const { error } = await portalState.supabase.rpc("submit_settlement_instructions", {
      p_quote_id: quoteId,
      p_method: method,
      p_bank_routing_number: settlementRequiresBanking(method) ? bankRoutingNumber : null,
      p_bank_account_number: settlementRequiresBanking(method) ? bankAccountNumber : null
    });

    if (error) {
      throw error;
    }

    await loadDashboard(portalState.supabase, portalState.user);
    showBanner(
      method === "Check"
        ? "Settlement instructions saved. The office will use the mailing address on file for a paper check."
        : `Settlement instructions saved. ${method} details are now on file.`,
      "success"
    );
  } catch (error) {
    showBanner(describePortalLoadError(error), "warning");
    console.error(error);
  } finally {
    submitButton?.removeAttribute("disabled");
    if (submitButton) {
      submitButton.textContent = "Save settlement instructions";
    }
  }
}

async function submitReturnLabelForm(form) {
  if (!portalState.supabase || !portalState.user) {
    showBanner("Sign in before uploading a return label.", "warning");
    return;
  }

  const quoteId = form.getAttribute("data-quote-id");
  if (!quoteId) {
    showBanner("The return label could not be matched to a quote.", "warning");
    return;
  }

  const returnLabelFile = form.querySelector('input[name="return_label_file"]')?.files?.[0] ?? null;
  if (!returnLabelFile || !isPdfFile(returnLabelFile)) {
    showBanner("Upload a prepaid 4x6 PDF return label before continuing.", "warning");
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton?.setAttribute("disabled", "disabled");
  if (submitButton) {
    submitButton.textContent = "Uploading return label...";
  }

  try {
    const labelPath = buildStoragePath(portalState.user.id, quoteId, "return-label", returnLabelFile.name);
    const uploadResponse = await portalState.supabase
      .storage
      .from("return-labels")
      .upload(labelPath, returnLabelFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "application/pdf"
      });

    if (uploadResponse.error) {
      throw uploadResponse.error;
    }

    const returnLabelResponse = await portalState.supabase.rpc("submit_return_label", {
      p_quote_id: quoteId,
      p_label_object_path: labelPath
    });

    if (returnLabelResponse.error) {
      throw returnLabelResponse.error;
    }

    await loadDashboard(portalState.supabase, portalState.user);
    showBanner("Return label uploaded successfully. The office will review it and arrange shipment back to you.", "success");
  } catch (error) {
    showBanner(describePortalLoadError(error), "warning");
    console.error(error);
  } finally {
    submitButton?.removeAttribute("disabled");
    if (submitButton) {
      submitButton.textContent = "Upload return label";
    }
  }
}

async function respondToOffer(quoteId, response) {
  if (!portalState.supabase || !portalState.user || !quoteId) {
    return;
  }

  const actionLabel = response === "accepted" ? "Accepting" : "Declining";
  showBanner(`${actionLabel} the final offer...`, "success");

  const { error } = await portalState.supabase.rpc("respond_to_offer", {
    p_quote_id: quoteId,
    p_response: response
  });

  if (error) {
    showBanner(describePortalLoadError(error), "warning");
    console.error(error);
    return;
  }

  await loadDashboard(portalState.supabase, portalState.user);
  showBanner(
    response === "accepted"
      ? "Final offer accepted successfully."
      : "Final offer declined. Upload a 4x6 PDF return label within 30 days if you want the items returned.",
    "success"
  );
}

async function handlePortalSession(supabase, session) {
  if (!session?.user) {
    showLoggedOut();
    return;
  }

  portalState.supabase = supabase;
  portalState.user = session.user;
  signOutButton.classList.remove("hidden");

  try {
    const claimedCount = await claimPortalIntakeRequests(supabase);
    await loadDashboard(supabase, session.user);

    if (claimedCount > 0) {
      const requestLabel = claimedCount === 1 ? "request" : "requests";
      showBanner(`Client records loaded successfully. ${claimedCount} matching website ${requestLabel} ${claimedCount === 1 ? "was" : "were"} added to the portal.`, "success");
      return;
    }

    showBanner("Client records loaded successfully.", "success");
  } catch (error) {
    showBanner(describePortalLoadError(error), "warning");
    console.error(error);
  }
}

async function initLivePortal() {
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  portalState.supabase = supabase;
  showBanner(`${brandName} client portal is connected. Magic-link sign-in is available.`, "success");

  magicLinkForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(magicLinkForm);
    const email = String(formData.get("email") || "").trim();

    if (!email) {
      showBanner("Enter an email address before requesting a sign-in link.", "warning");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: supabaseConfig.magicLinkRedirectTo || window.location.href
      }
    });

    if (error) {
      showBanner(error.message, "warning");
      return;
    }

    showBanner("Sign-in link sent. The client can complete secure access from their inbox.", "success");
    magicLinkForm.reset();
  });

  signOutButton.addEventListener("click", async () => {
    await supabase.auth.signOut();
    showLoggedOut();
    showBanner("Signed out. Portal access remains private.", "success");
  });

  quoteList.addEventListener("submit", async (event) => {
    const shipmentForm = event.target.closest(".portal-shipment-form");
    if (shipmentForm) {
      event.preventDefault();
      await submitShipmentForm(shipmentForm);
      return;
    }

    const settlementForm = event.target.closest(".portal-settlement-form");
    if (settlementForm) {
      event.preventDefault();
      await submitSettlementForm(settlementForm);
      return;
    }

    const returnLabelForm = event.target.closest(".portal-return-label-form");
    if (returnLabelForm) {
      event.preventDefault();
      await submitReturnLabelForm(returnLabelForm);
    }
  });

  quoteList.addEventListener("change", (event) => {
    const settlementSelect = event.target.closest('.portal-settlement-form select[name="preferred_settlement"]');
    if (!settlementSelect) {
      return;
    }

    syncPortalSettlementFormFields(settlementSelect.closest(".portal-settlement-form"));
  });

  quoteList.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-quote-toggle]");
    if (toggleButton) {
      const quoteId = toggleButton.getAttribute("data-quote-toggle");
      portalState.expandedQuoteId = portalState.expandedQuoteId === quoteId ? null : quoteId;
      renderQuotes(portalState.quotes);
      return;
    }

    const storageButton = event.target.closest("[data-storage-path]");
    if (storageButton) {
      try {
        await openStorageObjectUrl(
          storageButton.getAttribute("data-storage-bucket"),
          storageButton.getAttribute("data-storage-path")
        );
      } catch (error) {
        showBanner(describePortalLoadError(error), "warning");
        console.error(error);
      }
      return;
    }

    const offerButton = event.target.closest("[data-offer-response]");
    if (offerButton) {
      const quoteId = offerButton.getAttribute("data-quote-id");
      const response = offerButton.getAttribute("data-offer-response");
      await respondToOffer(quoteId, response);
    }
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handlePortalSession(supabase, session).catch((error) => {
        showBanner(describePortalLoadError(error), "warning");
        console.error(error);
      });
    }, 0);
  });

  const sessionResponse = await supabase.auth.getSession();
  await handlePortalSession(supabase, sessionResponse.data.session ?? null);
}

initRevealAnimations();

if (isConfigured()) {
  initLivePortal().catch((error) => {
    showBanner("Portal credentials are present, but initialization failed. Review the browser console for details.", "warning");
    console.error(error);
  });
} else {
  renderDemoMode();
}
