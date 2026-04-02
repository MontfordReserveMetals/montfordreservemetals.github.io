import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireRefreshAuthorization } from "../_shared/auth.ts";

const METALS_ENDPOINT = "https://api.metals.dev/v1/latest";
const TRACKED_METALS = ["gold", "silver", "platinum", "palladium"] as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    requireRefreshAuthorization(request);

    const apiKey = Deno.env.get("METALS_DEV_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!apiKey || !supabaseUrl || !serviceRoleKey) {
      return jsonResponse(
        { error: "METALS_DEV_API_KEY, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY is missing." },
        500
      );
    }

    const url = new URL(METALS_ENDPOINT);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("currency", "USD");
    url.searchParams.set("unit", "toz");

    const upstreamResponse = await fetch(url);
    if (!upstreamResponse.ok) {
      return jsonResponse(
        { error: `metals.dev request failed with ${upstreamResponse.status}.` },
        502
      );
    }

    const payload = await upstreamResponse.json();
    const fetchedAt = payload.timestamp
      ? new Date(Number(payload.timestamp) * 1000).toISOString()
      : new Date().toISOString();

    const rows = TRACKED_METALS.flatMap((metal) => {
      const price = Number(payload.metals?.[metal]);
      if (!Number.isFinite(price) || price <= 0) {
        return [];
      }

      return [{
        metal_type: metal,
        spot_price_per_ounce_usd: Number(price.toFixed(4)),
        currency: payload.currency || "USD",
        unit: payload.unit || "toz",
        source: "metals.dev",
        fetched_at: fetchedAt,
        raw_payload: payload
      }];
    });

    if (!rows.length) {
      return jsonResponse({ error: "No supported metal prices were returned by metals.dev." }, 502);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { error } = await supabase
      .from("market_price_cache")
      .upsert(rows, { onConflict: "metal_type" });

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({
      refreshed: rows.map((row) => row.metal_type),
      fetched_at: fetchedAt,
      source: "metals.dev"
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
