// ============================================================
// LEGIONARIOS · Backend del quiz — Supabase Edge Function
// Ruta: supabase/functions/registrar-lead/index.ts
//
// Qué hace por cada envío del quiz:
//   1. Valida el payload (email obligatorio).
//   2. Inserta el lead en public.quiz_leads (con service role).
//   3. Crea/actualiza el perfil en Klaviyo con TODAS las propiedades
//      y lo suscribe a la lista — con la LLAVE PRIVADA, del lado servidor.
//   4. Responde { ok: true } al frontend.
//
// La BD es la fuente de verdad: si Klaviyo falla, el lead IGUAL se guarda
// y se marca klaviyo_ok = false en la respuesta (revisable en logs).
//
// Secrets que debes configurar (ver README):
//   KLAVIYO_PRIVATE_KEY   -> llave privada de Klaviyo (pk_...)
//   KLAVIYO_LIST_ID       -> ID de la lista destino
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase solo.)
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*", // en producción puedes fijar tu dominio
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

// Nota: verifica en tu cuenta de Klaviyo que esta revisión siga vigente.
const KLAVIYO_REVISION = "2024-10-15";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "método no permitido" }, 405);

  let p: Record<string, unknown>;
  try {
    p = await req.json();
  } catch {
    return json({ ok: false, error: "JSON inválido" }, 400);
  }

  // ---------- validación mínima ----------
  const email = String(p.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ ok: false, error: "email inválido" }, 400);
  }
  const texto = (v: unknown, max = 300) => String(v ?? "").slice(0, max);
  const lead = {
    nombre: texto(p.nombre, 120),
    email,
    whatsapp: texto(p.whatsapp, 20),
    etapa: texto(p.etapa, 30),
    programa: texto(p.programa, 160),
    tier: texto(p.tier, 20),
    lead_score: Number(p.lead_score ?? 0),
    grasa_actual: texto(p.grasa_actual, 60),
    grasa_meta: texto(p.grasa_meta, 60),
    lugar: texto(p.lugar, 80),
    fuente: texto(p.fuente, 60),
    modo: texto(p.modo, 20),
    respuestas: Array.isArray(p.respuestas) ? p.respuestas.slice(0, 20) : [],
  };

  // ---------- 1) guardar en Supabase (fuente de verdad) ----------
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error: dbError } = await supabase.from("quiz_leads").insert(lead);
  if (dbError) {
    console.error("Supabase insert:", dbError.message);
    return json({ ok: false, error: "no se pudo guardar el lead" }, 500);
  }

  // ---------- 2) Klaviyo (mejor esfuerzo; nunca tumba la respuesta) ----------
  let klaviyoOk = false;
  const KLAVIYO_KEY = Deno.env.get("KLAVIYO_PRIVATE_KEY");
  const LIST_ID = Deno.env.get("KLAVIYO_LIST_ID");

  if (KLAVIYO_KEY && LIST_ID) {
    try {
      const headers = {
        "Authorization": `Klaviyo-API-Key ${KLAVIYO_KEY}`,
        "Content-Type": "application/json",
        "revision": KLAVIYO_REVISION,
      };

      // 2a. Upsert del perfil con todas las propiedades del diagnóstico
      const perfil: Record<string, unknown> = {
        email: lead.email,
        first_name: lead.nombre,
        properties: {
          etapa: lead.etapa,
          programa: lead.programa,
          tier: lead.tier,
          lead_score: lead.lead_score,
          grasa_actual: lead.grasa_actual,
          grasa_meta: lead.grasa_meta,
          lugar: lead.lugar,
          fuente: lead.fuente,
          quiz: "expediente-legionario",
          negocio: "infoproductos",
          tipo_lead: "low_ticket",
        },
      };
      if (lead.whatsapp) perfil.phone_number = lead.whatsapp;

      const up = await fetch("https://a.klaviyo.com/api/profile-import/", {
        method: "POST",
        headers,
        body: JSON.stringify({ data: { type: "profile", attributes: perfil } }),
      });
      if (!up.ok && up.status !== 201) {
        console.error("Klaviyo profile-import:", up.status, await up.text());
      }

      // 2b. Suscripción a la lista (consentimiento de email)
      const sub = await fetch(
        "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs/",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            data: {
              type: "profile-subscription-bulk-create-job",
              attributes: {
                profiles: {
                  data: [{
                    type: "profile",
                    attributes: {
                      email: lead.email,
                      subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
                    },
                  }],
                },
              },
              relationships: { list: { data: { type: "list", id: LIST_ID } } },
            },
          }),
        },
      );
      klaviyoOk = sub.ok || sub.status === 202;
      if (!klaviyoOk) console.error("Klaviyo subscribe:", sub.status, await sub.text());
    } catch (e) {
      console.error("Klaviyo error:", e);
    }
  }

  return json({ ok: true, klaviyo_ok: klaviyoOk });
});
