import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const siteConfig = window.siteConfig ?? {};

const marketTickerOrder = ["gold", "silver", "platinum", "palladium"];
const marketPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

const marketTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short"
});

let marketBannerPromise = null;

function isSupabaseConfigured() {
  const { url, anonKey } = siteConfig.supabase ?? {};

  return Boolean(
    url &&
    anonKey &&
    !url.includes("YOUR_SUPABASE_URL") &&
    !anonKey.includes("YOUR_SUPABASE_ANON_KEY")
  );
}

function ensureMarketBanner() {
  const header = document.querySelector(".site-header");
  if (!header) {
    return null;
  }

  const existingBanner = document.querySelector("[data-market-banner]");
  if (existingBanner) {
    return existingBanner;
  }

  const banner = document.createElement("section");
  banner.className = "market-banner";
  banner.setAttribute("data-market-banner", "");
  banner.setAttribute("aria-label", "Current market prices");
  banner.innerHTML = `
    <div class="market-banner-shell">
      <div class="market-banner-label">Current market prices</div>
      <div class="market-banner-marquee" aria-live="polite">
        <div class="market-banner-track" data-market-banner-track>
          <div class="market-banner-group">
            <span class="market-chip">Preparing private market tape...</span>
          </div>
          <div class="market-banner-group" aria-hidden="true">
            <span class="market-chip">Preparing private market tape...</span>
          </div>
        </div>
      </div>
      <div class="market-banner-meta" data-market-banner-meta>Cached office market feed</div>
    </div>
  `;

  header.insertAdjacentElement("afterend", banner);
  return banner;
}

function setMarketBannerState(items, metaText) {
  const banner = ensureMarketBanner();
  if (!banner) {
    return;
  }

  const track = banner.querySelector("[data-market-banner-track]");
  const meta = banner.querySelector("[data-market-banner-meta]");

  if (track) {
    const groupMarkup = items.map((item) => `<span class="market-chip">${item}</span>`).join("");
    track.innerHTML = `
      <div class="market-banner-group">${groupMarkup}</div>
      <div class="market-banner-group" aria-hidden="true">${groupMarkup}</div>
    `;
  }

  if (meta) {
    meta.textContent = metaText;
  }
}

async function initMarketBanner() {
  if (marketBannerPromise) {
    return marketBannerPromise;
  }

  marketBannerPromise = (async () => {
    ensureMarketBanner();

    if (!isSupabaseConfigured()) {
      setMarketBannerState(
        ["Gold, silver, platinum, and palladium tape will appear once the live office feed is connected."],
        "Connect Supabase to display cached market prices."
      );
      return;
    }

    const { url, anonKey } = siteConfig.supabase;
    const supabase = createClient(url, anonKey);

    try {
      const { data, error } = await supabase
        .from("market_price_cache")
        .select("metal_type, spot_price_per_ounce_usd, fetched_at")
        .order("fetched_at", { ascending: false });

      if (error) {
        throw error;
      }

      if (!data?.length) {
        setMarketBannerState(
          ["Market prices will display after the office refresh job runs for the first time."],
          "No cached market prices yet."
        );
        return;
      }

      const sortedRows = [...data].sort((left, right) => {
        return marketTickerOrder.indexOf(left.metal_type) - marketTickerOrder.indexOf(right.metal_type);
      });

      const items = sortedRows.map((row) => {
        const metalLabel = row.metal_type.charAt(0).toUpperCase() + row.metal_type.slice(1);
        return `${metalLabel} ${marketPriceFormatter.format(Number(row.spot_price_per_ounce_usd))}/oz`;
      });

      const fetchedAt = sortedRows
        .map((row) => row.fetched_at)
        .filter(Boolean)
        .sort()
        .at(-1);

      setMarketBannerState(
        items,
        fetchedAt
          ? `Cached from metals.dev · ${marketTimestampFormatter.format(new Date(fetchedAt))}`
          : "Cached from metals.dev"
      );
    } catch (error) {
      console.error(error);
      setMarketBannerState(
        ["Market tape is temporarily unavailable. Please check back shortly."],
        "Cached market feed unavailable."
      );
    }
  })();

  return marketBannerPromise;
}

export function applySiteChrome() {
  const brandName = siteConfig.brand?.name ?? "Montford Reserve Metals";
  const brandMark = siteConfig.brand?.mark ?? "MR";
  const brandDescriptor = siteConfig.brand?.descriptor ?? "Buyers of Gold, Silver & Fine Jewelry";
  const brandEmail = siteConfig.brand?.email ?? "privateoffice@example.com";
  const phoneDisplay = siteConfig.brand?.phoneDisplay ?? "(561) 555-0188";
  const phoneHref = siteConfig.brand?.phoneHref ?? "+15615550188";
  const founderName = siteConfig.founder?.name ?? "James Montford";
  const founderTitle = siteConfig.founder?.title ?? "Director of Private Acquisitions";

  document.querySelectorAll("[data-brand-name]").forEach((node) => {
    node.textContent = brandName;
  });

  document.querySelectorAll("[data-brand-mark]").forEach((node) => {
    node.textContent = brandMark;
  });

  document.querySelectorAll("[data-brand-descriptor]").forEach((node) => {
    node.textContent = brandDescriptor;
  });

  document.querySelectorAll("[data-contact-email]").forEach((node) => {
    node.textContent = brandEmail;
    node.setAttribute("href", `mailto:${brandEmail}`);
  });

  document.querySelectorAll("[data-contact-phone]").forEach((node) => {
    node.textContent = phoneDisplay;
    node.setAttribute("href", `tel:${phoneHref}`);
  });

  document.querySelectorAll("[data-founder-name]").forEach((node) => {
    node.textContent = founderName;
  });

  document.querySelectorAll("[data-founder-title]").forEach((node) => {
    node.textContent = founderTitle;
  });

  const currentYear = document.getElementById("current-year");
  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  initMarketBanner().catch((error) => console.error(error));
}

export function initRevealAnimations() {
  const revealElements = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.18 });

    revealElements.forEach((element) => observer.observe(element));
    return;
  }

  revealElements.forEach((element) => element.classList.add("is-visible"));
}
