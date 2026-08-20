# Dónde vamos — 19 de agosto, 2026

Todo el código está **escrito, probado y en tu repo** (`git status` limpio, último commit 21:35).
Lo que falta son **tres cosas que solo puedes hacer tú**, y una está bloqueando a las otras.

---

## 🔴 Lo que está bloqueado ahora mismo

### 1. El despliegue de Netlify no se ve al día

El último despliegue que veo es **anterior a tu último `publish.sh`**. O sea: el código está en GitHub pero puede que el sitio publicado siga con la versión vieja.

**Revisa:** [Deploys de demandu-chatbots](https://app.netlify.com/projects/demandu-chatbots/deploys) — mira si el de arriba dice *Published* y si su fecha es posterior a las 21:35. Si falló, ahí sale el error del build.

Hasta que esto esté, **no vas a ver** el Embudo arreglado, el reparto de chats, la IA de respaldo ni el diagnóstico de Meta. Están en el código, no en tu pantalla.

### 2. La llave de Anthropic sigue sin funcionar

Confirmado desde la base: **la IA no ha contestado ni una sola vez**. Cargaste 9 fragmentos de conocimiento (bien 👍), pero sin la llave el bot solo puede decir "esa no me la sé".

Te quedaste atorado en Netlify con un "Access Denied". Lo que verifiqué desde aquí:

- Eres **Owner** del equipo, plan Pro.
- `demandu-chatbots` **no tiene contraseña**.
- Pero tu otro sitio, **`demandu-hud`, sí la tiene para todo el sitio** — si acabaste ahí, "Access Denied" es exactamente lo esperado.

**Enlace directo al lugar correcto:** https://app.netlify.com/projects/demandu-chatbots/configuration/env

Si ahí también te bloquea, es la cuenta con la que está tu navegador: ábrelo en incógnito.

Va en **dos lados**: Netlify (chat web) y Supabase → Edge Functions → Secrets (WhatsApp).
En Netlify hay que **volver a desplegar** para que aplique; en Supabase no.

### 3. WhatsApp: estás en el número de pruebas de Meta

Tu WABA tiene **un solo número: +1 555-307-0428**, el que Meta regala. En ése **no se puede aprobar un nombre para mostrar**, así que la revisión no termina nunca y ningún mensaje sale.

Todo lo demás está aprobado (negocio verificado, cuenta aprobada, calidad alta, número verificado). **La solución es dar de alta tu número propio**, no esperar.

---

## ✅ Lo que ya quedó (y está en tu repo)

| | Estado |
|---|---|
| **Resultados** (analítica) | Listo. Filtros por periodo, canal y chatbot; efectividad por flujo y por persona. |
| **Embudo (CRM)** | Listo. Tarjetas automáticas, arrastrar, tareas, alerta de "sin próximo paso". Ya tienes 5 tarjetas y 1 tarea. |
| **Embudo ↔ Bandeja** | Arreglado. La etapa viaja en los dos sentidos. |
| **Tablero que "se regresaba"** | Arreglado. Era caché de Next, los datos siempre estuvieron bien. |
| **Reparto automático de chats** | Listo, **apagado**. Se prende en Configuración → Reparto de chats. |
| **IA cuando el cliente se sale del flujo** | Listo en el canal web. Falta espejarlo en WhatsApp. |
| **Notificaciones que no salían** | Arreglado. Nadie subía el contador de "sin leer"; ahora hay 9 pendientes bien contados. |
| **Entrenamiento: campos que no se vaciaban** | Arreglado. |
| **Diagnóstico "Estado en Meta"** | Listo, dentro de Conexión. Detecta solo el número de pruebas. |
| **Pruebas** | 130 automáticas + 47 contra la base. `./scripts/probar.sh` |

---

## 📋 Qué hacer cuando vuelvas, en este orden

1. **Revisa el despliegue de Netlify.** Si no está al día, vuelve a lanzarlo (*Trigger deploy → Deploy site*). Sin esto nada de lo de abajo se puede probar.
2. **Pon `ANTHROPIC_API_KEY`** en Netlify (con el enlace directo de arriba) y en Supabase. Vuelve a desplegar Netlify.
3. **Prueba la IA** en el chat web: pregúntale algo que esté en tus 9 fragmentos. Y luego pregúntale algo que NO esté — debe decir que no sabe, no inventar.
4. **Prende el reparto** en Configuración → Reparto de chats.
5. **Da de alta tu número real** en Meta. Con el negocio ya verificado, el nombre suele aprobarse en minutos.

---

## Lo que queda pendiente de mi lado

- **Espejar la IA de respaldo en el motor de WhatsApp** (hoy solo vive en el canal web).
- Arreglar que el atajo "1" baje el contador de no leídos a 1 en vez de dejarlo como estaba (va junto con lo anterior, en el mismo despliegue del motor).
- **Recordatorios automáticos por plantilla de utilidad** — lo que hablamos de que una tarea se ejecute sola. Quedó aprobado como buena idea, sin construir.
- **El bot que aprende de lo que no supo responder** — el diferenciador real que identificamos. Apuntado para después del CRM.
- Macros de un clic, nota de cierre con categoría, fusión de contactos entre canales.
- Recorrido en navegador para cazar fallos visuales (las pruebas no ven nada visual).
