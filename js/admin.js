import { siteConfig, applySiteChrome, initRevealAnimations } from "./site-shell.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = siteConfig;
const supabaseConfig = config.supabase ?? {};
const brandName = config.brand?.name ?? "Montford Reserve Metals";

applySiteChrome();

const adminBanner = document.getElementById("admin-status-banner");
const adminLayout = document.getElementById("admin-layout");
const staffAuthCard = document.getElementById("staff-auth-card");
const staffLoginForm = document.getElementById("staff-login-form");
const adminEmptyState = document.getElementById("admin-empty-state");
const adminDashboardGrid = document.getElementById("admin-dashboard-grid");
const adminSignOutButton = document.getElementById("admin-sign-out-button");
const staffName = document.getElementById("staff-name");
const staffMeta = document.getElementById("staff-meta");
const intakeMetrics = document.getElementById("intake-metrics");
const intakeFilterBar = document.getElementById("intake-filter-bar");
const intakeList = document.getElementById("intake-list");
const selectedIntakeEmpty = document.getElementById("selected-intake-empty");
const selectedIntakePanel = document.getElementById("selected-intake-panel");
const selectedIntakeDetails = document.getElementById("selected-intake-details");
const selectedIntakeNotes = document.getElementById("selected-intake-notes");
const selectedIntakePill = document.getElementById("selected-intake-pill");
const intakeStatusForm = document.getElementById("intake-status-form");
const intakeStatusSelect = document.getElementById("intake-status-select");
const profileMatchPanel = document.getElementById("profile-match-panel");
const quoteCreateForm = document.getElementById("quote-create-form");
const createQuoteButton = document.getElementById("create-quote-button");
const quoteItemSummary = document.getElementById("quote-item-summary");
const quoteKarat = document.getElementById("quote-karat");
const quoteWeight = document.getElementById("quote-weight");
const quoteEstimate = document.getElementById("quote-estimate");
const quoteStatus = document.getElementById("quote-status");
const quoteStatusDetail = document.getElementById("quote-status-detail");
const quoteCountLabel = document.getElementById("quote-count-label");
const adminQuoteList = document.getElementById("admin-quote-list");

const intakeStatuses = ["new", "reviewed", "contacted", "converted", "closed"];
const intakeFilters = ["active", "new", "reviewed", "contacted", "converted", "closed", "all"];
const quoteStatuses = [
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

const quoteStatusLabels = {
  submitted: "Submitted",
  awaiting_shipment: "Awaiting shipment",
  in_transit: "In transit",
  received: "Received",
  inspection_complete: "Inspection complete",
  offer_sent: "Offer sent",
  accepted: "Accepted",
  paid: "Paid",
  returned: "Returned"
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

const state = {
  supabase: null,
  staffRecord: null,
  activeUserId: null,
  intakeRequests: [],
  selectedIntakeId: null,
  matchedProfile: null,
  quotes: [],
  intakeFilter: "active"
};

function showBanner(message, tone = "warning") {
  adminBanner.textContent = message;
  adminBanner.className = `status-banner ${tone}`;
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

function formatLabel(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function quoteStatusOptionsMarkup(selectedValue) {
  return quoteStatuses.map((statusValue) => {
    const selected = statusValue === selectedValue ? " selected" : "";
    return `<option value="${statusValue}"${selected}>${escapeHtml(quoteStatusLabels[statusValue] || formatLabel(statusValue))}</option>`;
  }).join("");
}

function intakeFilterMatches(intake) {
  if (state.intakeFilter === "all") {
    return true;
  }

  if (state.intakeFilter === "active") {
    return !["converted", "closed"].includes(intake.status);
  }

  return intake.status === state.intakeFilter;
}

function getSelectedIntake() {
  return state.intakeRequests.find((intake) => intake.id === state.selectedIntakeId) ?? null;
}

function renderLoggedOut() {
  state.staffRecord = null;
  state.activeUserId = null;
  state.intakeRequests = [];
  state.selectedIntakeId = null;
  state.matchedProfile = null;
  state.quotes = [];

  staffAuthCard.classList.remove("hidden");
  adminLayout.classList.remove("auth-hidden");
  adminSignOutButton.classList.add("hidden");
  adminDashboardGrid.classList.add("hidden");
  adminEmptyState.classList.remove("hidden");

  staffName.textContent = "Private office overview";
  staffMeta.textContent = "Sign in to review intake requests, create client files, and update portal statuses.";

  intakeMetrics.innerHTML = "";
  intakeList.innerHTML = "";
  selectedIntakeDetails.innerHTML = "";
  selectedIntakeNotes.innerHTML = "";
  profileMatchPanel.innerHTML = "";
  adminQuoteList.innerHTML = "";
  quoteCountLabel.textContent = "No client files yet.";
  selectedIntakeEmpty.classList.remove("hidden");
  selectedIntakePanel.classList.add("hidden");
  createQuoteButton.disabled = true;
}

function renderAuthenticatedShell(staffRecord, user) {
  staffAuthCard.classList.add("hidden");
  adminLayout.classList.add("auth-hidden");
  adminSignOutButton.classList.remove("hidden");
  adminEmptyState.classList.add("hidden");
  adminDashboardGrid.classList.remove("hidden");

  staffName.textContent = staffRecord.full_name || "Office dashboard";
  staffMeta.textContent = `${user.email || "Signed in"} · ${formatLabel(staffRecord.role)}`;
}

function renderMetrics() {
  const counts = intakeStatuses.reduce((accumulator, statusValue) => {
    accumulator[statusValue] = state.intakeRequests.filter((item) => item.status === statusValue).length;
    return accumulator;
  }, {});

  counts.active = state.intakeRequests.filter((item) => !["converted", "closed"].includes(item.status)).length;
  counts.all = state.intakeRequests.length;

  const metricItems = [
    ["Active", counts.active],
    ["New", counts.new],
    ["Reviewed", counts.reviewed],
    ["Contacted", counts.contacted],
    ["Converted", counts.converted],
    ["Closed", counts.closed]
  ];

  intakeMetrics.innerHTML = metricItems.map(([label, value]) => `
    <article class="admin-metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function renderFilterButtons() {
  intakeFilterBar.querySelectorAll("[data-filter]").forEach((button) => {
    const matches = button.getAttribute("data-filter") === state.intakeFilter;
    button.classList.toggle("is-active", matches);
  });
}

function renderIntakeList() {
  const filteredRequests = state.intakeRequests.filter(intakeFilterMatches);

  if (!filteredRequests.length) {
    intakeList.innerHTML = `
      <article class="admin-empty">
        No intake requests match the current filter.
      </article>
    `;
    return;
  }

  intakeList.innerHTML = filteredRequests.map((intake) => {
    const isSelected = intake.id === state.selectedIntakeId;
    return `
      <button class="intake-card${isSelected ? " is-selected" : ""}" type="button" data-intake-id="${escapeHtml(intake.id)}">
        <div class="intake-card-head">
          <strong>${escapeHtml(intake.full_name)}</strong>
          <span class="admin-status-pill">${escapeHtml(formatLabel(intake.status))}</span>
        </div>
        <div class="intake-card-meta">
          <span>${escapeHtml(intake.email)}</span>
          <span>${escapeHtml(formatDate(intake.created_at))}</span>
        </div>
        <p>${escapeHtml(intake.item_summary)}</p>
        <div class="intake-card-meta">
          <span>${escapeHtml(intake.claimed_karat || "Mixed")} · ${escapeHtml(Number(intake.claimed_weight_grams || 0).toFixed(1))}g</span>
          <span>${escapeHtml(formatCurrency(intake.estimated_quote))}</span>
        </div>
      </button>
    `;
  }).join("");
}

function renderSelectedIntake() {
  const intake = getSelectedIntake();

  if (!intake) {
    selectedIntakeEmpty.classList.remove("hidden");
    selectedIntakePanel.classList.add("hidden");
    return;
  }

  selectedIntakeEmpty.classList.add("hidden");
  selectedIntakePanel.classList.remove("hidden");
  selectedIntakePill.textContent = formatLabel(intake.status);
  intakeStatusSelect.value = intake.status;

  selectedIntakeDetails.innerHTML = `
    <div>
      <dt>Client</dt>
      <dd>${escapeHtml(intake.full_name)}</dd>
    </div>
    <div>
      <dt>Email</dt>
      <dd>${escapeHtml(intake.email)}</dd>
    </div>
    <div>
      <dt>Phone</dt>
      <dd>${escapeHtml(intake.phone || "Not provided")}</dd>
    </div>
    <div>
      <dt>Submitted</dt>
      <dd>${escapeHtml(formatDateTime(intake.created_at))}</dd>
    </div>
    <div>
      <dt>Estimate</dt>
      <dd>${escapeHtml(formatCurrency(intake.estimated_quote))}</dd>
    </div>
    <div>
      <dt>Settlement</dt>
      <dd>${escapeHtml(intake.preferred_settlement || "Not specified")}</dd>
    </div>
    <div>
      <dt>Claimed purity</dt>
      <dd>${escapeHtml(intake.claimed_karat || "Mixed")}</dd>
    </div>
    <div>
      <dt>Claimed weight</dt>
      <dd>${escapeHtml(Number(intake.claimed_weight_grams || 0).toFixed(2))} grams</dd>
    </div>
    <div class="detail-list-wide">
      <dt>Item summary</dt>
      <dd>${escapeHtml(intake.item_summary)}</dd>
    </div>
  `;

  selectedIntakeNotes.innerHTML = `
    <strong>Client notes</strong>
    <p>${escapeHtml(intake.notes || "No client notes were submitted.")}</p>
  `;

  if (state.matchedProfile) {
    profileMatchPanel.innerHTML = `
      <strong>Portal account found</strong>
      <p>${escapeHtml(state.matchedProfile.full_name || intake.full_name || "Client")} is linked to ${escapeHtml(state.matchedProfile.email || intake.email)}.</p>
      <p>${escapeHtml([state.matchedProfile.city, state.matchedProfile.state].filter(Boolean).join(", ") || "No location on file yet.")}</p>
    `;
    createQuoteButton.disabled = false;
  } else {
    profileMatchPanel.innerHTML = `
      <strong>No portal account yet</strong>
      <p>Ask this client to sign into <code>portal.html</code> once using ${escapeHtml(intake.email)}. That first sign-in creates the linked <code>profiles</code> row required for portal-visible quote files.</p>
    `;
    createQuoteButton.disabled = true;
  }

  quoteItemSummary.value = intake.item_summary || "";
  quoteKarat.value = intake.claimed_karat || "mixed";
  quoteWeight.value = Number(intake.claimed_weight_grams || 0).toFixed(2);
  quoteEstimate.value = Number(intake.estimated_quote || 0).toFixed(2);
  quoteStatus.value = "awaiting_shipment";
  quoteStatusDetail.value = `Your file is active. The office will confirm the next step and shipping instructions shortly.`;

  renderQuoteList();
}

function renderQuoteList() {
  if (!state.quotes.length) {
    quoteCountLabel.textContent = "No client files yet.";
    adminQuoteList.innerHTML = `
      <article class="admin-empty">
        Once you create a quote for the matched portal profile, it will appear here automatically.
      </article>
    `;
    return;
  }

  quoteCountLabel.textContent = `${state.quotes.length} client file${state.quotes.length === 1 ? "" : "s"}`;

  adminQuoteList.innerHTML = state.quotes.map((quote) => `
    <article class="quote-card quote-admin-card">
      <div class="quote-header">
        <div>
          <strong>${escapeHtml(quote.item_summary || "Client file")}</strong>
          <div class="quote-meta">
            <span>${escapeHtml(quote.reference_code)}</span>
            <span>${escapeHtml(formatDate(quote.submitted_at))}</span>
            <span>${escapeHtml(quote.claimed_karat || "Mixed")} · ${escapeHtml(Number(quote.claimed_weight_grams || 0).toFixed(1))}g</span>
          </div>
        </div>
        <span class="admin-status-pill">${escapeHtml(quoteStatusLabels[quote.status] || formatLabel(quote.status))}</span>
      </div>

      <form class="admin-quote-form" data-quote-id="${escapeHtml(quote.id)}">
        <div class="admin-form-grid">
          <label>
            Portal status
            <select name="status">
              ${quoteStatusOptionsMarkup(quote.status)}
            </select>
          </label>

          <label>
            Estimate
            <input name="estimated_quote" type="number" min="0" step="0.01" value="${escapeHtml(Number(quote.estimated_quote || 0).toFixed(2))}">
          </label>

          <label class="form-span-2">
            Status detail
            <textarea name="status_detail" rows="3" placeholder="Explain what the client should expect next.">${escapeHtml(quote.status_detail || "")}</textarea>
          </label>
        </div>
        <div class="admin-actions">
          <button class="button button-primary" type="submit">Save portal status</button>
        </div>
      </form>
    </article>
  `).join("");
}

async function loadIntakeRequests() {
  const { data, error } = await state.supabase
    .from("intake_requests")
    .select(`
      id,
      full_name,
      email,
      phone,
      metal_type,
      item_summary,
      claimed_karat,
      claimed_weight_grams,
      estimated_quote,
      preferred_settlement,
      notes,
      status,
      market_spot_per_ounce,
      market_source,
      market_snapshot_at,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  state.intakeRequests = data ?? [];

  if (!state.selectedIntakeId && state.intakeRequests.length) {
    const firstVisibleRequest = state.intakeRequests.find(intakeFilterMatches) ?? state.intakeRequests[0];
    state.selectedIntakeId = firstVisibleRequest?.id ?? null;
  }

  renderMetrics();
  renderFilterButtons();
  renderIntakeList();
}

async function loadSelectedIntakeData(intakeId) {
  state.selectedIntakeId = intakeId;
  state.matchedProfile = null;
  state.quotes = [];

  const intake = getSelectedIntake();
  renderIntakeList();
  renderSelectedIntake();

  if (!intake) {
    return;
  }

  const profileResponse = await state.supabase
    .from("profiles")
    .select("id, full_name, email, phone, city, state")
    .ilike("email", intake.email)
    .maybeSingle();

  if (profileResponse.error) {
    throw profileResponse.error;
  }

  state.matchedProfile = profileResponse.data ?? null;

  if (state.matchedProfile?.id) {
    const quotesResponse = await state.supabase
      .from("quotes")
      .select(`
        id,
        reference_code,
        item_summary,
        claimed_karat,
        claimed_weight_grams,
        estimated_quote,
        status,
        status_detail,
        submitted_at
      `)
      .eq("user_id", state.matchedProfile.id)
      .order("submitted_at", { ascending: false });

    if (quotesResponse.error) {
      throw quotesResponse.error;
    }

    state.quotes = quotesResponse.data ?? [];
  }

  renderSelectedIntake();
}

async function syncSelectionToCurrentFilter() {
  const selectedIntake = getSelectedIntake();
  if (selectedIntake && intakeFilterMatches(selectedIntake)) {
    renderSelectedIntake();
    return;
  }

  const firstVisibleRequest = state.intakeRequests.find(intakeFilterMatches) ?? null;
  await loadSelectedIntakeData(firstVisibleRequest?.id ?? null);
}

async function refreshDashboard(preserveSelection = true) {
  const currentSelection = preserveSelection ? state.selectedIntakeId : null;
  await loadIntakeRequests();

  const nextSelection = currentSelection && state.intakeRequests.some((intake) => intake.id === currentSelection)
    ? currentSelection
    : state.intakeRequests.find(intakeFilterMatches)?.id ?? state.intakeRequests[0]?.id ?? null;

  state.selectedIntakeId = nextSelection;
  await loadSelectedIntakeData(nextSelection);
}

async function ensureStaffAccess(user) {
  const { data, error } = await state.supabase
    .from("staff_users")
    .select("user_id, full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("This account authenticated successfully, but it is not listed in staff_users.");
  }

  return data;
}

async function activateStaffSession(user) {
  if (state.activeUserId === user.id && state.staffRecord) {
    renderAuthenticatedShell(state.staffRecord, user);
    return;
  }

  const staffRecord = await ensureStaffAccess(user);
  state.staffRecord = staffRecord;
  state.activeUserId = user.id;

  renderAuthenticatedShell(staffRecord, user);
  await refreshDashboard(false);
  showBanner("Office dashboard loaded successfully.", "success");
}

async function handleAdminSession(session) {
  if (!session?.user) {
    renderLoggedOut();
    return;
  }

  try {
    await activateStaffSession(session.user);
  } catch (error) {
    await state.supabase.auth.signOut();
    renderLoggedOut();
    showBanner(error instanceof Error ? error.message : "Staff authorization failed.", "warning");
    console.error(error);
  }
}

async function initAdminDashboard() {
  state.supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  showBanner(`${brandName} office dashboard is connected. Staff password sign-in is available.`, "success");

  staffLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(staffLoginForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      showBanner("Enter both the staff email address and password before signing in.", "warning");
      return;
    }

    showBanner("Signing in to the office dashboard...", "success");

    const { error } = await state.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      showBanner(error.message, "warning");
      return;
    }

    showBanner("Credentials accepted. Loading office dashboard...", "success");
    staffLoginForm.reset();
  });

  adminSignOutButton.addEventListener("click", async () => {
    await state.supabase.auth.signOut();
    renderLoggedOut();
    showBanner("Signed out of the office dashboard.", "success");
  });

  intakeFilterBar.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) {
      return;
    }

    const nextFilter = button.getAttribute("data-filter");
    if (!intakeFilters.includes(nextFilter)) {
      return;
    }

    state.intakeFilter = nextFilter;
    renderFilterButtons();
    renderIntakeList();
    await syncSelectionToCurrentFilter();
  });

  intakeList.addEventListener("click", async (event) => {
    const card = event.target.closest("[data-intake-id]");
    if (!card) {
      return;
    }

    const intakeId = card.getAttribute("data-intake-id");
    if (!intakeId) {
      return;
    }

    try {
      await loadSelectedIntakeData(intakeId);
    } catch (error) {
      showBanner(error instanceof Error ? error.message : "The selected request could not be loaded.", "warning");
      console.error(error);
    }
  });

  intakeStatusForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const intake = getSelectedIntake();
    if (!intake) {
      showBanner("Choose an intake request before updating its status.", "warning");
      return;
    }

    const nextStatus = String(intakeStatusSelect.value || "new");
    if (!intakeStatuses.includes(nextStatus)) {
      showBanner("Choose a valid intake status.", "warning");
      return;
    }

    const { error } = await state.supabase
      .from("intake_requests")
      .update({ status: nextStatus })
      .eq("id", intake.id);

    if (error) {
      showBanner(error.message, "warning");
      return;
    }

    intake.status = nextStatus;
    renderMetrics();
    renderFilterButtons();
    renderIntakeList();
    await syncSelectionToCurrentFilter();
    showBanner("Request status updated successfully.", "success");
  });

  quoteCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const intake = getSelectedIntake();
    if (!intake || !state.matchedProfile) {
      showBanner("A matched portal profile is required before creating a client file.", "warning");
      return;
    }

    createQuoteButton.setAttribute("disabled", "disabled");
    createQuoteButton.textContent = "Creating client file...";

    const formData = new FormData(quoteCreateForm);
    const payload = {
      user_id: state.matchedProfile.id,
      metal_type: intake.metal_type || "gold",
      item_summary: String(formData.get("item_summary") || "").trim(),
      claimed_karat: String(formData.get("claimed_karat") || "mixed"),
      claimed_weight_grams: Number(formData.get("claimed_weight_grams") || 0),
      estimated_quote: Number(formData.get("estimated_quote") || 0),
      market_spot_per_ounce: intake.market_spot_per_ounce ? Number(intake.market_spot_per_ounce) : null,
      market_source: intake.market_source || null,
      market_snapshot_at: intake.market_snapshot_at || null,
      status: String(formData.get("status") || "awaiting_shipment"),
      status_detail: String(formData.get("status_detail") || "").trim() || null
    };

    const insertResponse = await state.supabase
      .from("quotes")
      .insert(payload)
      .select("id")
      .maybeSingle();

    createQuoteButton.removeAttribute("disabled");
    createQuoteButton.textContent = "Create client file";

    if (insertResponse.error) {
      showBanner(insertResponse.error.message, "warning");
      return;
    }

    if (intake.status !== "converted") {
      const updateResponse = await state.supabase
        .from("intake_requests")
        .update({ status: "converted" })
        .eq("id", intake.id);

      if (!updateResponse.error) {
        intake.status = "converted";
      }
    }

    await refreshDashboard(true);
    showBanner("Client file created and linked to the matched portal profile.", "success");
  });

  adminQuoteList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".admin-quote-form");
    if (!form) {
      return;
    }

    event.preventDefault();

    const quoteId = form.getAttribute("data-quote-id");
    if (!quoteId) {
      return;
    }

    const formData = new FormData(form);
    const payload = {
      status: String(formData.get("status") || "submitted"),
      estimated_quote: Number(formData.get("estimated_quote") || 0),
      status_detail: String(formData.get("status_detail") || "").trim() || null
    };

    const { error } = await state.supabase
      .from("quotes")
      .update(payload)
      .eq("id", quoteId);

    if (error) {
      showBanner(error.message, "warning");
      return;
    }

    await loadSelectedIntakeData(state.selectedIntakeId);
    showBanner("Client file updated successfully.", "success");
  });

  state.supabase.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => {
      handleAdminSession(session).catch((error) => {
        showBanner(error instanceof Error ? error.message : "Staff authorization failed.", "warning");
        console.error(error);
      });
    }, 0);
  });

  const sessionResponse = await state.supabase.auth.getSession();
  await handleAdminSession(sessionResponse.data.session ?? null);
}

initRevealAnimations();

if (isConfigured()) {
  initAdminDashboard().catch((error) => {
    renderLoggedOut();
    showBanner("Admin credentials are present, but the dashboard could not be initialized. Review the browser console for details.", "warning");
    console.error(error);
  });
} else {
  renderLoggedOut();
}
