-- ============================================================
-- LEGIONARIOS · Quiz Diagnóstico v2 — configuración Supabase
-- Pegar completo en: Supabase → SQL Editor → Run
-- ============================================================

create table if not exists public.quiz_leads (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  nombre       text,
  email        text not null,
  whatsapp     text,
  etapa        text,          -- definir | subir | recomp
  programa     text,          -- nombre del programa asignado
  tier         text,          -- ICP_ALTO | ICP_MEDIO | ICP_BAJO
  lead_score   int,
  grasa_actual text,          -- casilla elegida en la tabla
  grasa_meta   text,
  lugar        text,          -- gym / casa / mezcla
  fuente       text,          -- ?src= del link (reel1, bio, webinar…)
  modo         text,          -- lanzamiento | evergreen
  respuestas   jsonb          -- todas las respuestas en orden
);

-- Índices útiles para tus consultas diarias
create index if not exists quiz_leads_created_idx on public.quiz_leads (created_at desc);
create index if not exists quiz_leads_tier_idx    on public.quiz_leads (tier);
create index if not exists quiz_leads_email_idx   on public.quiz_leads (email);

-- Seguridad: el frontend (anon key) SOLO puede insertar. Nunca leer ni borrar.
alter table public.quiz_leads enable row level security;

drop policy if exists "anon puede insertar" on public.quiz_leads;
create policy "anon puede insertar"
  on public.quiz_leads for insert
  to anon
  with check (true);

-- (Sin política de SELECT para anon: la base solo se lee desde el dashboard
--  de Supabase o con la service key. Tu "hoja" visible es Table Editor.)

-- ============================================================
-- Vista rápida para el equipo: ICP altos de los últimos 7 días
-- (se consulta desde el dashboard)
-- ============================================================
create or replace view public.icp_altos_semana as
  select created_at, nombre, email, whatsapp, etapa, programa, grasa_actual, fuente
  from public.quiz_leads
  where tier = 'ICP_ALTO'
    and created_at > now() - interval '7 days'
  order by created_at desc;
