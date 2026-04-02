function jsonResponse(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export function requirePublicApiKey(request: Request) {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const publishableKey = Deno.env.get("SB_PUBLISHABLE_KEY");
  const apikey = request.headers.get("apikey");

  const acceptedKeys = [anonKey, publishableKey].filter((value): value is string => Boolean(value));

  if (!acceptedKeys.length) {
    throw jsonResponse("SUPABASE_ANON_KEY or SB_PUBLISHABLE_KEY must be configured in the function environment.", 500);
  }

  if (!apikey || !acceptedKeys.includes(apikey)) {
    throw jsonResponse("Public API key is missing or invalid.", 401);
  }
}

export function requireRefreshAuthorization(request: Request) {
  const refreshSecret = Deno.env.get("MARKET_REFRESH_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const suppliedRefreshSecret = request.headers.get("x-refresh-secret");

  if (refreshSecret && suppliedRefreshSecret === refreshSecret) {
    return;
  }

  if (serviceRoleKey && bearer === serviceRoleKey) {
    return;
  }

  throw jsonResponse("Refresh authorization failed.", 401);
}
