import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requirePublicApiKey } from "../_shared/auth.ts";

const KARAT_PURITY: Record<string, number> = {
  "10K": 0.417,
  "14K": 0.585,
  "18K": 0.75,
  "22K": 0.916,
  "24K": 0.999
};

const DEFAULT_PURITY: Record<string, number> = {
  gold: 0.999,
  silver: 0.999,
  platinum: 0.999,
  palladium: 0.999
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function getPayoutFactor(metalType: string) {
  const envKey = `${metalType.toUpperCase()}_PAYOUT_FACTOR`;
  const value = Number(Deno.env.get(envKey) ?? "0");
  return Number.isFinite(value) && value > 0 ? value : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    requirePublicApiKey(request);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing." }, 500);
    }

    const body = await request.json();
    const metalType = String(body.metalType || "gold").toLowerCase();
    const karat = String(body.karat || "").toUpperCase();
    const suppliedPurity = Number(body.purity);
    const weightGrams = Number(body.weightGrams);

    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      return jsonResponse({ error: "A valid weightGrams value is required." }, 400);
    }

    const payoutFactor = getPayoutFactor(metalType);
    if (!payoutFactor) {
      return jsonResponse({ error: `No payout factor is configured for ${metalType}.` }, 500);
    }

    let purity = Number.NaN;
    if (metalType === "gold") {
      purity = KARAT_PURITY[karat];
    }

    if (!Number.isFinite(purity)) {
      purity = Number.isFinite(suppliedPurity) && suppliedPurity > 0 && suppliedPurity <= 1
        ? suppliedPurity
        : DEFAULT_PURITY[metalType];
    }

    if (!Number.isFinite(purity) || purity <= 0) {
      return jsonResponse({ error: "A valid purity value could not be determined." }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data, error } = await supabase
      .from("market_price_cache")
      .select("metal_type, spot_price_per_ounce_usd, fetched_at, source")
      .eq("metal_type", metalType)
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    if (!data) {
      return jsonResponse(
        { error: `No cached ${metalType} price is available. Refresh market prices first.` },
        503
      );
    }

    const payoutPerPureOunce = Number(data.spot_price_per_ounce_usd) * payoutFactor;
    const estimate = (weightGrams * purity * payoutPerPureOunce) / 31.1035;

    return jsonResponse({
      metalType,
      karat: karat || null,
      weightGrams: Number(weightGrams.toFixed(2)),
      estimatedQuote: Number(estimate.toFixed(2)),
      marketSpotPerOunce: Number(data.spot_price_per_ounce_usd),
      marketSnapshotAt: data.fetched_at,
      marketSource: data.source,
      message:
        `Based on current market conditions, the estimated amount you would receive is ` +
        `${currencyFormatter.format(estimate)}. Submit promptly to help lock in this estimate before prices change.`
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
