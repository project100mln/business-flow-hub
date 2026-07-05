// Меняет статус лида в hyla_leads по нажатию кнопки под карточкой в
// Telegram — без захода в CRM. Защищена тем же общим паролем
// HYLA_BOT_SHARED_SECRET, что и hyla-bot-intake.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hyla-bot-secret",
};

const VALID_STATUSES = [
  "new",
  "quiz_done",
  "operator_contacted",
  "demo_scheduled",
  "demo_done",
  "callback",
  "thinking",
  "sale",
  "refused",
];

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

  const leadId = typeof body.lead_id === "string" ? body.lead_id : "";
  const status = typeof body.status === "string" ? body.status : "";

  if (!leadId || !VALID_STATUSES.includes(status)) {
    return new Response(
      JSON.stringify({ error: "lead_id and a valid status are required" }),
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

  const { error } = await supabase
    .from("hyla_leads")
    .update({ status })
    .eq("id", leadId);

  if (error) {
    console.error("[hyla-bot-update-status] update error:", error.message);
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
