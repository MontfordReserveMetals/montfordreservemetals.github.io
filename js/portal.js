import { siteConfig, applySiteChrome, initRevealAnimations } from "./site-shell.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

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

const demoProfile = {
  full_name: "Sample Client",
  email: "client@example.com",
  phone: "(555) 555-0101",
  city: "Middleburg",
  state: "Virginia"
};

const demoQuotes = [
  {
    id: "demo-1",
    reference_code: "MRM-D9F21A0C",
    item_summary: "Estate bracelet, cufflinks, and mixed gold chains",
    claimed_karat: "14K",
    claimed_weight_grams: 68.4,
    estimated_quote: 3590,
    status: "received",
    status_detail: "Your parcel has been logged and is awaiting testing.",
    submitted_at: "2026-03-22T16:00:00Z",
    shipments: [
      {
        carrier: "FedEx",
        tracking_number: "794938503019",
        status: "received",
        received_at: "2026-03-25T14:20:00Z"
      }
    ],
    offers: []
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
    shipments: [
      {
        carrier: "UPS",
        tracking_number: "1Z19AE450357",
        status: "received",
        received_at: "2026-03-19T10:15:00Z"
      }
    ],
    offers: [
      {
        final_offer: 2915,
        sent_at: "2026-03-20T15:45:00Z",
        expires_at: "2026-03-27T23:59:00Z"
      }
    ]
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

  if (/row-level security/i.test(message) || /permission denied/i.test(message)) {
    return "The portal sign-in worked, but the current RLS policies are blocking access. Re-run the latest supabase/schema.sql.";
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

function formatDate(value) {
  return value ? dateFormatter.format(new Date(value)) : "Not yet available";
}

function renderProfile(profile) {
  profileName.textContent = profile.full_name || "Private client overview";
  profileMeta.textContent = `${profile.email || "No email on file"}${profile.phone ? ` - ${profile.phone}` : ""}`;

  profileGrid.innerHTML = `
    <div>
      <dt>Client</dt>
      <dd>${profile.full_name || "Not provided"}</dd>
    </div>
    <div>
      <dt>Email</dt>
      <dd>${profile.email || "Not provided"}</dd>
    </div>
    <div>
      <dt>Phone</dt>
      <dd>${profile.phone || "Not provided"}</dd>
    </div>
    <div>
      <dt>Location</dt>
      <dd>${[profile.city, profile.state].filter(Boolean).join(", ") || "Not provided"}</dd>
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
    return `<span class="${stateClass}">${stepLabels[step]}</span>`;
  }).join("");
}

function renderQuotes(quotes) {
  if (!quotes.length) {
    quoteList.innerHTML = `
      <article class="empty-state">
        <h3>No active submissions</h3>
        <p>Once a quote is created for the signed-in user, it will appear here automatically.</p>
      </article>
    `;
    return;
  }

  quoteList.innerHTML = quotes.map((quote) => {
    const shipment = quote.shipments?.[0];
    const offer = quote.offers?.[0];
    const metaItems = [
      `${quote.claimed_karat || "Mixed"} - ${Number(quote.claimed_weight_grams || 0).toFixed(1)}g`,
      `Submitted ${formatDate(quote.submitted_at)}`,
      `Ref ${quote.reference_code}`
    ];

    const subMeta = [];
    if (shipment?.tracking_number) {
      subMeta.push(`Tracking ${shipment.tracking_number}`);
    }
    if (shipment?.received_at) {
      subMeta.push(`Received ${formatDate(shipment.received_at)}`);
    }
    if (offer?.final_offer) {
      subMeta.push(`Final offer ${currencyFormatter.format(Number(offer.final_offer))}`);
    }

    return `
      <article class="quote-card">
        <div class="quote-header">
          <div>
            <strong>${quote.item_summary || "Precious-metals submission"}</strong>
            <div class="quote-meta">${metaItems.map((item) => `<span>${item}</span>`).join("")}</div>
          </div>
          <span class="timeline-step active">${stepLabels[quote.status] || "Status pending"}</span>
        </div>
        <div class="quote-submeta">
          <span>Estimate ${currencyFormatter.format(Number(quote.estimated_quote || 0))}</span>
          ${subMeta.map((item) => `<span>${item}</span>`).join("")}
        </div>
        <p>${quote.status_detail || "Your case is currently being reviewed."}</p>
        <div class="timeline">${renderTimeline(quote.status)}</div>
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
  profileName.textContent = "Private client overview";
  profileMeta.textContent = "Portal data will appear here after secure sign-in.";
  dashboardGrid.classList.add("hidden");
  emptyState.classList.remove("hidden");
  signOutButton.classList.add("hidden");
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
    .select("full_name, email, phone, city, state")
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
      claimed_karat,
      claimed_weight_grams,
      estimated_quote,
      status,
      status_detail,
      submitted_at,
      shipments (
        carrier,
        tracking_number,
        status,
        received_at
      ),
      offers (
        final_offer,
        sent_at,
        expires_at
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

async function handlePortalSession(supabase, session) {
  if (!session?.user) {
    showLoggedOut();
    return;
  }

  signOutButton.classList.remove("hidden");

  try {
    await loadDashboard(supabase, session.user);
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
