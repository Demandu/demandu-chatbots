# Hallazgos abiertos de Demandu Platform

**Este archivo existe porque el cuello de botella no es encontrar: es cerrar.**

El 8 de septiembre seis auditores dejaron 15 hallazgos rojos con archivo y línea.
El 18 de septiembre se comprobaron al azar tres: uno estaba arreglado, dos
seguían abiertos, y **nadie sabía cuáles**. Un hallazgo sin forma de
re-comprobarlo se convierte en folclore en dos semanas.

Por eso cada renglón lleva **cómo volver a comprobarlo**. Si no se puede
comprobar con un comando o una consulta, no está bien escrito.

Lo mantiene el agente `cazador` (`.claude/agents/cazador.md`).

---

## Cómo se lee

| Estado | Significa |
|---|---|
| 🔴 **abierto** | Comprobado que sigue ocurriendo, con la fecha de la última comprobación |
| 🟡 **sospecha** | Parece un fallo pero no se ha visto ocurrir. No cuenta como hallazgo hasta reproducirlo |
| ⬜ **sin comprobar** | No se pudo mirar. Nunca se marca verde |
| 🟠 **arreglo escrito** | El arreglo está en los archivos y la regla se vio roja, pero **no se ha publicado**. En producción sigue pasando |
| ✅ **cerrado** | Arreglado **y** con una regla que se pone roja si vuelve |

---

## 🔴 Abiertos, comprobados el 18 sep 2026

### H-02 · La tienda pública reparte `org_id` y `bot_id` de todos los negocios
**Origen:** auditoría 8 sep, punto 1.4 · `supabase/migrations/0070_tienda.sql:117`

`anon` puede leer las columnas `org_id` y `bot_id` de `tiendas`. Por sí solo es
enumeración; el problema es que ese par de llaves es justo lo que necesitaban
los hallazgos 1.2 y 1.3.

**Comprobado:** `anon` sigue con SELECT sobre `org_id` y `bot_id`.

```sql
select grantee, string_agg(column_name, ', ' order by column_name)
from information_schema.column_privileges
where table_name='tiendas' and privilege_type='SELECT' and grantee='anon'
group by grantee;
```

**Arreglo conocido:** `revoke select` + `grant select (columnas)`, como ya lo
llevan `whatsapp_channels`, `integrations` y `tienda_cobros`.

---

## 🟠 Arreglo escrito, pendiente de publicar

### H-01 · Tres avisos de cobro de Stripe se descartaron con un 200 mudo
**Origen:** auditoría 8 sep, punto 1.9 · `src/app/api/stripe/webhook/route.ts`
**Investigado y escrito:** 18 sep 2026. **Sin publicar.**

**QUIÉN ERA — y esto es lo primero que había que saber.** Los tres avisos son de
un cobro **real, en modo producción** (`livemode: true`): factura
`in_1UCTd6CtyvDLMclC9dlu42sk`, $64.00, cliente `cus_U5xp274l8KapC9`,
**Salo Market · jonathan@grupozena.com**, factura número `GLJFJA11-0007` (la
séptima de ese cliente). El concepto de la línea lo dice todo:

```
"description": "1 × Demandu Catalog (at $64.00 / month)"
"nickname":    "Catalogo Demandu"   (prod_U5xa7ePo48RzbA)
"billing_reason": "subscription_cycle"
```

**No es un cliente de la plataforma de chatbots, y no es una prueba vieja: es un
cliente real de OTRO producto de la casa** (Demandu Catalog), que vive en la
misma cuenta de Stripe (`acct_1PEJwuCtyvDLMclC`) y por eso sus avisos caen en
este webhook. Comprobado por los dos lados:

```sql
-- ninguna organización tiene ese cliente de Stripe
select id, name, stripe_customer_id from organizations
where stripe_customer_id = 'cus_U5xp274l8KapC9';            -- 0 filas
-- y ese correo no tiene cuenta en la plataforma
select id, email from auth.users where email = 'jonathan@grupozena.com';  -- 0 filas
```

**Nadie de la plataforma pagó y se quedó sin su plan.** De hecho `billing_events`
tiene **3 filas en total**: la plataforma todavía no ha cobrado a nadie, y las
seis organizaciones están en `estado_cobro = 'prueba'`.

**Pero el fallo es real igual.** El código no sabía que era de otro producto: lo
tiró por la misma puerta por la que se habría ido el pago de un cliente nuestro.
El silencio era el mismo.

**¿Se perdería mañana un pago nuevo?** Por el camino normal, no: al abrir el pago
`suscripcion.ts` guarda `stripe_customer_id` en la organización y escribe
`subscription_data[metadata][org_id]`, así que la factura llega identificada por
dos vías. **El agujero que quedaba** es la suscripción dada de alta **a mano
desde el panel de Stripe** o por enlace de pago —una venta cerrada por teléfono—:
no lleva metadata, y si el cliente de Stripe no estaba guardado, no se
encontraba. Eso ahora se busca por un tercer camino y, si aun así no aparece,
**se apunta**.

**El arreglo (escrito, sin publicar):**

| Archivo | Qué cambia |
|---|---|
| `src/app/api/stripe/webhook/route.ts` | Se van los cuatro `if (!orgId) break;`. Un evento de dinero sin organización escribe `error = "sin_organizacion · …"` con cliente, correo y factura, y sale por `console.error`. `orgDelEvento` busca ahora por un tercer camino (la suscripción) y **mira el error** de la consulta, que no es lo mismo que «no existe» |
| `src/app/superadmin/estado/page.tsx` | Aviso rojo arriba del todo con los cobros que no encontraron cuenta y sus pistas para buscarlos en Stripe |
| `scripts/pruebas/estatico.mjs` | La regla nueva, abajo |

**Se sigue contestando 200 a propósito.** El aviso de otro producto de la casa no
se arregla por reintentarlo, y Stripe desactiva la dirección entera cuando una
serie de avisos falla. Lo que cambia no es el código de respuesta: es que deja
rastro.

**La regla que lo vigila:** `estatico.mjs` → «Un aviso de dinero no se descarta en
silencio». Cuatro pruebas, **las cuatro vistas rojas** con su mutante:

| Mutante | Prueba que se puso roja |
|---|---|
| Volver a poner `if (!orgId) break;` en `invoice.paid` | ningún evento sin organización se tira sin decir nada |
| `let fallo: string \| null = null;` | sin organización, el evento de dinero queda marcado como fallo |
| Sacar `"invoice.payment_failed"` de `EVENTOS_DE_DINERO` dejando su `case` | todo `case` que se atiende cuenta como dinero |
| Que el panel de estado deje de consultar `billing_events` | los cobros sin dueño salen en una pantalla |

La tercera es el trinquete de verdad: quien añada mañana un cobro nuevo al
`switch` y se olvide de la lista, se pone rojo antes de publicar.

**Cómo volver a comprobarlo** (después de publicar; hoy siguen dando 3 porque las
tres filas viejas se quedan como están):

```sql
select count(*) from billing_events
where procesado_at is not null and error is null and org_id is null;   -- tiene que dar 0
```

⬜ **Falta, y lo tiene que hacer el dueño:** poner al día esas tres filas viejas,
que el arreglo no toca. **No se ejecutó nada contra producción.**

```sql
update billing_events set error =
  'sin_organizacion · repaso 18 sep 2026 · Demandu Catalog (Salo Market), no es de la plataforma'
where stripe_event_id in (
  'evt_1UDZ49CtyvDLMclC2QafALTp',
  'evt_1UDb6GCtyvDLMclC5wbVIBio',
  'evt_1UDb6GCtyvDLMclCHjvryPhH'
);   -- 3 filas
```

---

## 🟡 Sospechas (no reproducidas)

### H-03 · `WA_FIRMA` podría seguir en «observar»
**Origen:** auditoría 8 sep, punto 1.5

Con «observar», la firma se comprueba, el fallo se apunta **y el mensaje se
procesa igual**. El valor vive en los secretos de Supabase, no en el repo, así
que desde aquí no se puede leer.

**Lo que sí se sabe:** solo hay **2 firmas malas en toda la historia, la última
el 2 de septiembre**. Dieciséis días en cero: pasarlo a `exigir` no debería
romper nada.

```sql
select count(*), max(created_at) from conexiones_fallidas where paso='webhook_firma';
```

### H-04 · El bloque Multimedia manda la URL como texto en el widget web
**Origen:** doc «Probar flujo corre el motor de verdad», hallazgo de propina
`src/lib/flow/webRuntime.ts` → `case "media": push(ctx, node.data.mediaUrl)`

En WhatsApp llega como imagen; en el widget web, como enlace pelado. Nunca se
arregló y está escrito que es un fallo real.

### H-06 · La cuenta de Stripe es compartida con otros productos de la casa
**Visto el 18 sep 2026 al investigar H-01.**

`acct_1PEJwuCtyvDLMclC` cobra también «Demandu Catalog». Sus avisos llegan al
webhook de la plataforma y **siempre van a llegar**. Con el arreglo de H-01 ya no
se pierden en silencio, pero cada renovación de ese producto va a dejar una línea
en el aviso rojo del panel de estado. Si eso molesta, la salida limpia es
**separar el webhook por producto** en el panel de Stripe (o filtrar por
`prod_…`), no volver a callar el aviso.

### H-07 · Guardar el cliente de Stripe no mira si la escritura salió bien
**Visto el 18 sep 2026 al investigar H-01.** `src/lib/billing/suscripcion.ts`,
`clienteDeStripe()`:

```ts
await admin.from("organizations").update({ stripe_customer_id: creado.id }).eq("id", org.id);
```

Si esa escritura falla, el cliente queda creado en Stripe y la organización sin
su identificador: el cobro sale y el aviso vuelve sin dueño. Es uno de los ~250
sitios de «consultas que no miran su error», pero este está en el camino del
dinero. **No reproducido.**

### H-05 · Las migraciones no reconstruyen la base
**Origen:** auditoría 8 sep, sección 4

Columnas que existen en producción y no las crea ninguna migración
(`flows.name`, `flows.enabled`, `flows.trigger_type`,
`conversations.handoff_requested_at`, `contacts.wa_name`…). Consecuencia: no hay
forma de levantar un entorno de pruebas ni de recuperar la base si se pierde.

**Comprobado a medias:** las tres columnas de `flows` existen en producción. No
se ha intentado un `db reset` sobre una base limpia.

---

## ⬜ Sin comprobar

- **Las otras diez rojas de la auditoría del 8 sep** (1.1, 1.3, 1.6, 1.7, 1.8 y
  las de la sección 2). Hay que re-comprobarlas una a una: al azar salió que una
  de tres ya estaba arreglada, así que la lista vieja **no se puede dar por
  cierta ni por falsa**.
- **Las doce reglas huecas** de la sección 2. Cada una tiene su mutante escrito
  en el informe; la forma de cerrarlas es correr el mutante, ver la regla roja, y
  solo entonces quitar el mutante.
- **Los ~250 sitios de deuda** de la sección 3 (consultas que no miran su
  `error`). El arreglo no es sitio por sitio: es una regla estática que lo exija,
  y después ir bajando — el mismo trinquete que ya se usó para el idioma.

---

## ✅ Cerrados

### 2026-09-18 · Las funciones `definer` ya comprueban la organización
**Era:** auditoría 8 sep, punto 1.2. `buscar_conocimiento` era `security definer`
concedida a `authenticated` sin comprobar que el `p_org_id` fuera de quien
llama: cualquiera podía vaciar la base de conocimiento de otro negocio.

**Comprobado cerrado:** las cuatro (`buscar_conocimiento`, `calificar_contacto`,
`elegir_por_etiqueta`, `puedo_llamar`) comprueban la organización.

```sql
select p.proname, p.prosecdef,
       (pg_get_functiondef(p.oid) ilike '%auth_org_ids%'
        or pg_get_functiondef(p.oid) ilike '%b.org_id = p_org_id%') as comprueba_org
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('buscar_conocimiento','calificar_contacto','elegir_por_etiqueta','puedo_llamar');
```

⚠️ **Sin regla que lo vigile.** Está arreglado, pero nada impide que la próxima
función `definer` nazca igual. Eso lo deja a medio cerrar según las reglas del
cazador.
