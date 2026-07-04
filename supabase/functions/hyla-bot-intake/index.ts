// Принимает лида от внешнего Telegram-бота (Railway) и сохраняет его в
// таблицу hyla_leads. Доступ защищён общим паролем HYLA_BOT_SHARED_SECRET
// (Secrets этого проекта), а не ключом service_role — наружу, на Railway,
// уходит только этот узкий пароль, а не полный доступ к базе.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hyla-bot-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const providedSecret = req.headers.get("x-hyla-bot-secret");
  const expectedSecret = Deno.env.get("HYLA_BOT_SHARED_SECRET");

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const full_name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!full_name || !phone) {
    return new Response(
      JSON.stringify({ error: "full_name and phone are required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { error } = await supabase.from("hyla_leads").insert({
    full_name,
    phone,
    city: body.city ?? null,
    district: body.district ?? null,
    utm_source: body.utm_source ?? null,
    utm_campaign: body.utm_campaign ?? null,
    has_carpets: body.has_carpets ?? null,
    has_mattresses: body.has_mattresses ?? null,
    has_allergy: body.has_allergy ?? null,
    has_pets: body.has_pets ?? null,
    has_odors: body.has_odors ?? null,
    air_quality_interest: body.air_quality_interest ?? null,
    has_children: body.has_children ?? null,
    comment: body.comment ?? null,
  });

  if (error) {
    console.error("[hyla-bot-intake] insert error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
