# EXPEDIENTE LEGIONARIO — Quiz de diagnóstico
### Frontend + Backend completos · v1.0

```
legionarios-quiz/
├── index.html                                  ← FRONTEND (el quiz completo)
├── tabla-grasa.jpg                             ← LA PONES TÚ (tabla 8%–22%+)
└── backend/
    ├── supabase-setup.sql                      ← Base de datos (tabla + seguridad + vista)
    └── functions/registrar-lead/index.ts       ← Edge Function (BD + Klaviyo servidor)
```

Dos modos de operación — el frontend detecta solo cuál usar:

- **Modo BACKEND (recomendado):** llenas `EDGE_FUNCTION_URL` en el CONFIG → el quiz manda todo a tu Edge Function, que guarda en la BD con service role y sube el perfil a Klaviyo con tu **llave privada** (más confiable, propiedades completas, la llave nunca toca el navegador).
- **Modo DIRECTO (fallback):** dejas `EDGE_FUNCTION_URL` vacío → el quiz escribe directo a Supabase (anon key) y a Klaviyo (API pública) desde el navegador. Funciona, pero es plan B.

---

## PASO 1 — Base de datos (5 min)

1. [supabase.com](https://supabase.com) → tu proyecto → **SQL Editor**.
2. Pega TODO `backend/supabase-setup.sql` → **Run**.
3. Verifica en **Table Editor** que existe `quiz_leads` (esa es tu "hoja" visible).
4. Copia de **Settings → API**: `Project URL` y `anon public key`.

## PASO 2 — Backend / Edge Function (15 min, una sola vez)

Necesitas la [CLI de Supabase](https://supabase.com/docs/guides/functions) instalada.

```bash
# en la raíz de tu proyecto local
supabase login
supabase link --project-ref TU_PROJECT_REF        # el ref sale de la URL del proyecto

# copia backend/functions/registrar-lead/ a supabase/functions/registrar-lead/

# secretos (la llave PRIVADA de Klaviyo: Settings → API Keys → Create Private Key)
supabase secrets set KLAVIYO_PRIVATE_KEY=pk_xxxxxxxx
supabase secrets set KLAVIYO_LIST_ID=XxXxXx

# deploy — SIN verificación de JWT para que el navegador pueda llamarla
supabase functions deploy registrar-lead --no-verify-jwt
```

Tu endpoint queda en:
`https://TU-PROYECTO.supabase.co/functions/v1/registrar-lead`

Pruébalo antes de seguir:
```bash
curl -X POST "https://TU-PROYECTO.supabase.co/functions/v1/registrar-lead" \
  -H "Content-Type: application/json" \
  -d '{"email":"prueba@test.com","nombre":"Prueba","etapa":"recomp","programa":"SISTEMA","tier":"ICP_BAJO","lead_score":3,"grasa_actual":"15-18%","grasa_meta":"10-12%","lugar":"gym","fuente":"curl","modo":"lanzamiento","respuestas":[]}'
```
Debe responder `{"ok":true,...}` y la fila debe aparecer en `quiz_leads`.

> Seguridad extra (opcional): si SOLO vas a usar el modo backend, puedes borrar
> la política "anon puede insertar" en Supabase — así ni siquiera el anon key
> puede escribir y todo pasa por la función.

## PASO 3 — Klaviyo (5 min)

1. Crea la lista destino (ej. "Quiz Diagnóstico") y copia su **List ID**.
2. **IMPORTANTE:** en la lista, configura **single opt-in** (no double), o los
   leads no entrarán hasta confirmar correo — en semana de lanzamiento eso mata el flujo.
3. La llave **privada** (pk_...) va SOLO en los secrets del paso 2 — jamás en el HTML.
4. La llave **pública** (Company/Site ID, 6 caracteres) solo se usa en modo directo.
5. El código usa la revisión de API `2024-10-15` — si Klaviyo te marca error de
   revisión, actualiza la constante en `index.ts` y en el HTML a la vigente.

## PASO 4 — Frontend (10 min)

Abre `index.html` y llena el bloque `CONFIG` (arriba del todo):

| Campo | Qué va |
|---|---|
| `MODE` | `"lanzamiento"` (CTA → webinar) o `"evergreen"` (CTA → checkout del programa) |
| `EDGE_FUNCTION_URL` | la URL del paso 2 (recomendado) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | del paso 1 (solo se usan en modo directo) |
| `KLAVIYO_PUBLIC_KEY` / `KLAVIYO_LIST_ID` | solo modo directo |
| `SHEETS_URL` | opcional: tu Apps Script viejo como respaldo extra, `""` = apagado |
| `URLS.webinar` | link de registro a la masterclass |
| `URLS.definir / subir / recomp / casa` | checkouts de Hotmart de cada programa |
| `URLS.instagram` | IG de Bastián |

Sube a la misma carpeta la imagen **`tabla-grasa.jpg`** (la tabla del 8% al 22%+ que ya usaba Bastián). Si falta, el quiz muestra un recuadro avisando — no se rompe.

## PASO 5 — Publicar

Cualquier hosting estático sirve: Netlify / Vercel / GitHub Pages / tu dominio.
Sube `index.html` + `tabla-grasa.jpg` y listo.

**Atribución por canal:** comparte el link con `?src=`:
- Reel 1 → `https://tudominio.com/?src=reel1`
- Bio → `?src=bio` · Webinar → `?src=webinar` · Stories → `?src=story-lunes`

La fuente se guarda en cada lead — el viernes sabrás qué canal parió las ventas.

## PASO 6 — Prueba end-to-end (obligatoria antes de publicar el link)

1. Hazte el quiz completo con TU correo real y TU WhatsApp.
2. Verifica: tu fila en Supabase (**Table Editor → quiz_leads**) con todos los campos.
3. Verifica: tu perfil en Klaviyo, dentro de la lista, con las propiedades
   (`etapa`, `programa`, `tier`, `fuente`...).
4. Verifica en el celular: que la lámina se vea y las casillas respondan al toque.
5. El domingo del cierre: cambia `MODE` a `"evergreen"` y el quiz se vuelve tu
   embudo permanente de link en bio.

## Consultas útiles (SQL Editor)

```sql
-- ICP altos de la semana (para el setter, cada mañana)
select * from icp_altos_semana;

-- Ventas potenciales por fuente
select fuente, count(*) total,
       count(*) filter (where tier = 'ICP_ALTO') icp_altos
from quiz_leads
where created_at > now() - interval '7 days'
group by fuente order by total desc;

-- Distribución de etapas (¿validamos el 50% recomp?)
select etapa, count(*) from quiz_leads group by etapa order by 2 desc;
```
