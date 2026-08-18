# Demandu · Plataforma Conversacional

Plataforma propia de **Conversational Commerce / AI Agents & Chatbots** para independizarse de BotPenguin. Construida con **Next.js 14 + Supabase + Tailwind**, lista para desplegar en **Netlify**, con el **Design System 2.0** de Demandu.

> Este repo es la **fundación** (Milestone 1): sistema de diseño, auth, dashboard, **constructor visual de flujos** con todos sus componentes, y **webchat estilo WhatsApp Web** con preview que ejecuta el flujo. La capa de IA (Lana) queda preparada en el esquema pero se implementa en una fase posterior.

---

## ✨ Qué incluye hoy

| Área | Estado |
|---|---|
| Design System 2.0 (colores, Sora + Inter, isotipo, componentes) | ✅ |
| Auth (login/registro con Supabase) + middleware de sesión | ✅ |
| Dashboard con sidebar (Panel, Constructor, Bandeja, Contactos, Campañas…) | ✅ |
| **Constructor visual de flujos** (React Flow): 12 componentes, drag-and-drop, inspector por nodo | ✅ |
| **Webchat estilo WhatsApp** + preview en vivo que corre el flujo | ✅ |
| Bandeja unificada (UI) | ✅ (UI) |
| Esquema Supabase multi-tenant + RLS (bots, flujos, canales, contactos, conversaciones, mensajes, IA, RAG) | ✅ |
| Webhook WhatsApp Cloud API (verificación + recepción) | ✅ (stub) |
| Motor de IA / Lana (Voyage + Anthropic, o BYOK) | 🔜 fase 2 |
| Envío real por Graph API, campañas, Google Calendar | 🔜 fase 2 |

---

## 🚀 Puesta en marcha (VS Code)

```bash
# 1. Instalar dependencias
npm install

# 2. Variables de entorno
cp .env.example .env.local
#   (puedes correr la UI sin Supabase; para auth/datos llena las llaves)

# 3. Desarrollo
npm run dev        # http://localhost:3000
```

Rutas principales:

- `/login` · `/register` — autenticación
- `/dashboard` — panel de resultados
- `/bots` — lista de bots
- `/bots/sample-sales` — **constructor visual** (arrastra componentes, haz clic en un nodo para configurarlo, botón **▶ Probar flujo** abre el webchat)
- `/inbox` — bandeja unificada

> Sin Supabase configurado, el middleware entra en “modo vista previa” y puedes navegar toda la UI. Al llenar las llaves, se activa la protección de rutas y el login real.

---

## 🗄️ Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (o usa el que definamos, p. ej. `Demandu Chatbots`).
2. **Settings → API**: copia `Project URL` y `anon key` a `.env.local`.
3. Aplica el esquema:
   - **Opción A (CLI):** `supabase link --project-ref <ref>` y `supabase db push`
   - **Opción B (SQL Editor):** pega el contenido de `supabase/migrations/0001_init.sql` y ejecútalo.
4. El esquema es **multi-tenant con RLS**: cada usuario solo ve los datos de su(s) organización(es). Incluye `pgvector` para la base de conocimiento (RAG) de la futura IA.

Al registrar un usuario, crea su organización y membresía (owner). *Recomendado: un trigger `on auth.users` o una Server Action en el registro — pendiente para fase 2.*

---

## ☁️ Despliegue en Netlify

1. Sube el repo a GitHub.
2. En Netlify: **Add new site → Import from Git** y selecciona el repo.
3. Netlify detecta Next.js; `netlify.toml` ya incluye `@netlify/plugin-nextjs` (SSR, API routes y middleware).
4. **Site settings → Environment variables**: agrega las mismas llaves de `.env.example`.
5. Deploy. El webhook de WhatsApp quedará en `https://TU-SITIO/api/webhooks/whatsapp`.

---

## 🧩 Arquitectura del constructor

El flujo es un objeto único (`src/lib/flow/types.ts`) con `nodes` + `edges`, **compatible con React Flow** y guardable como JSON en la columna `flows.graph`. El **mismo objeto** alimenta:

- el **Constructor** (`src/components/builder/`), y
- el **motor del Webchat** (`src/lib/flow/engine.ts` + `src/components/Webchat.tsx`).

Componentes de nodo disponibles: `message, media, question, buttons, condition, ai, delay, action, calendar, tags, human, end` (metadatos en `NODE_META`).

### Estructura

```
src/
  app/
    (auth)/            login, register + layout de marca
    (dashboard)/       layout con sidebar + páginas (dashboard, bots, inbox)
    api/webhooks/whatsapp/route.ts
  components/
    builder/           FlowBuilder, Palette, Inspector, DemanduNodeCard
    Webchat.tsx        webchat estilo WhatsApp (ejecuta el flujo)
    Sidebar, Topbar, Logo, AuthForm
  lib/
    flow/              types, engine, sample
    supabase/          client, server, middleware
supabase/migrations/   0001_init.sql
```

---

## 🗺️ Roadmap sugerido (fase 2)

1. **Persistencia del flujo**: cargar/guardar `flows.graph` desde `/bots/[id]`.
2. **Onboarding de org**: crear organización + membership al registrarse.
3. **Motor de IA (Lana)**: `ai` node → Demandu AI (Voyage embeddings + Anthropic) y BYOK (Anthropic/OpenAI/Gemini). RAG sobre `kb_documents`.
4. **WhatsApp de verdad**: completar el webhook → guardar contacto/conversación/mensaje y responder por Graph API.
5. **Google Calendar**: nodo `calendar` real.
6. **Campañas / broadcasts** y **analytics**.

---

*Demandu · Tecnología Conversacional — Design System 2.0*
