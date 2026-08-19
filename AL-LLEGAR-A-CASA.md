# Al llegar a casa

Todo lo que sigue ya está escrito y probado. Solo falta que lo publiques.

---

## 1. Publicar (2 minutos)

```bash
cd ~/Documents/DEMANDU/Plataformas/demandu-chatbots
./scripts/probar.sh     # opcional: confirma que todo sigue en orden
./publish.sh
```

> Si `probar.sh` no tiene permiso de ejecución: `chmod +x scripts/probar.sh`

**El motor de WhatsApp NO necesita publicarse** — ya está desplegado (versión 10) y funcionando.

**La base tampoco** — las cinco migraciones nuevas (`0011` a `0015`) ya están aplicadas. Los archivos están en el repo solo para que quede el historial.

---

## 2. Lo que hay que hacer en Meta (bloquea todas las pruebas de WhatsApp)

Mientras esto no esté, **ningún mensaje sale de la plataforma**. No es un problema del código: Meta rechaza los envíos con el error `#131037`.

**Meta Business → WhatsApp Manager → tu número → Nombre para mostrar** → poner el nombre comercial y enviarlo a revisión.

- Tarda entre minutos y 48 horas.
- El nombre debe guardar relación con tu marca; si es genérico lo rechazan.
- Mientras tanto, en la Bandeja verás las burbujas marcadas **"No se entregó"** con el motivo. Eso es correcto: te está diciendo la verdad.

---

## 3. Dos llaves que solo tú puedes poner

| Dónde | Variable | Para qué |
|---|---|---|
| Netlify → variables de entorno | `GOOGLE_TRANSLATE_API_KEY` | El traductor del chat. Habilita **Cloud Translation API** en el proyecto de Google que ya usas para Calendar. |
| Netlify **y** Supabase → Edge Functions → Secrets | `ANTHROPIC_API_KEY` | Que la IA responda. Va en los **dos** lados: el canal web corre en Netlify, WhatsApp en Supabase. |
| Los mismos dos lados (opcional) | `VOYAGE_API_KEY` | Búsqueda por significado en el Entrenamiento. Sin ella funciona igual, con búsqueda por palabras. |

Sin estas llaves nada se rompe: el traductor avisa que no está activo y la IA responde su mensaje de respaldo.

---

## 4. Lo nuevo: **Embudo** (el CRM)

Hay una sección nueva en el menú, entre Conversaciones y Contactos.

### Cómo funciona

**No tienes que crear las tarjetas.** Cuando alguien te escribe por primera vez, su tarjeta aparece sola en la primera columna. Tres reglas, y son las que hacen la diferencia contra la competencia:

1. Si esa persona vuelve a escribir, **no se duplica** — se cuelga de la tarjeta que ya tenía.
2. Solo nace una tarjeta nueva **cuando la anterior ya se ganó o se perdió**. Así el cliente que vuelve en tres meses genera una venta nueva, y el que escribe cinco veces esta semana genera una sola.
3. **Cerrar el chat no cierra la venta.** Son cosas distintas: el agente cierra la conversación cuando terminó de atender; tú cierras la venta cuando cobraste.

> Kommo funde las dos cosas y por eso su embudo se llena de "¿tienen estacionamiento?" y de duplicados — hay una industria de widgets solo para limpiar eso. respond.io las separa bien pero renuncia al embudo y te manda a un CRM de verdad, que la pyme no tiene. Ese es el hueco.

Si prefieres crear las tarjetas a mano, se apaga en **Configuración → Embudo y etapas → “Crear tarjetas solo”**.

### Lo que puedes hacer

- **Arrastrar** una tarjeta entre columnas en la computadora. En el teléfono, cada tarjeta tiene un botón **Mover** — el arrastre táctil no existe en HTML y fingirlo sale mal.
- **Ponerle valor** a la venta. Arriba ves cuánto tienes *en juego* y cuánto llevas *ganado*.
- **Agendar el próximo paso** desde la ficha: escribes qué hay que hacer, tocas *Mañana* y listo.
- **Filtrar** por responsable o buscar por nombre y teléfono.
- **Abrir el chat** de esa persona desde la tarjeta.

### La alerta que ninguno de tus competidores tiene

Todos avisan de **tareas vencidas**. El lead que se pierde de verdad es el que **nunca tuvo una siguiente acción agendada** y nadie se dio cuenta. Eso es lo que vigila el aviso ámbar **"Sin próximo paso"**, en la tarjeta y arriba de Resultados.

### Etapas y embudos

**Configuración → Embudo y etapas.** Cada etapa dice además qué significa para la venta: *sigue abierta*, *venta ganada* o *se perdió*. Eso es lo que alimenta la efectividad de cierre. **Márcalas antes de mirar ese número**, si no sale vacío.

La mayoría de los negocios usa un solo embudo. Crea otro si vendes cosas muy distintas y no quieres mezclarlas.

### Un detalle que importa

La etapa que se ve en la Bandeja y la columna del Embudo son **la misma cosa**. Si cambias el estado desde el chat, la tarjeta se mueve en el tablero, y al revés. No hay dos listas que mantener.

---

## 5. Resultados ahora lee el embudo

La efectividad de cierre y las ventas por persona salen de las oportunidades, no del estado de la conversación. Si no, Resultados y Embudo contestarían distinto a la misma pregunta y una de las dos estaría mintiendo.

Además, arriba de todo aparece el aviso de cuántas oportunidades no tienen próximo paso — con un botón para ir al tablero. Va antes que las gráficas a propósito: es lo único de esa pantalla sobre lo que puedes actuar hoy.

---

## 6. Qué probar cuando publiques

Rápido, en este orden:

1. **Embudo** — entra y mira si ya hay tarjetas (se crearon con tus conversaciones de siempre). Arrastra una a otra columna. Ábrela y agéndale un próximo paso.
2. **Coherencia** — abre esa misma conversación en la Bandeja y cambia la etapa desde ahí. Vuelve al Embudo: la tarjeta debe haberse movido.
3. **Etapas** — Configuración → Embudo y etapas: marca cuáles son *Venta ganada* y cuáles *Se perdió*.
4. **Resultados** — el cierre y las ventas por persona deben cuadrar con el tablero.
5. **Scroll** — baja hasta el final en Embudo, Resultados y Configuración. No debe cortarse ni dejar hueco.
6. **Móvil** — abre el Embudo en el teléfono: las columnas se deslizan de lado y el botón *Mover* funciona.
7. **Contraste** — pasa el cursor por el botón de traducir, el menú "⋮" y "Pegar nota".
8. **Notificaciones** — Configuración → Notificaciones → "Probar aviso".

---

## 7. Estado de las pruebas

**114 automáticas + 35 de base de datos.** Un comando: `./scripts/probar.sh`

Las de base van aparte, pegando estos dos archivos en el editor SQL de Supabase:

- `scripts/pruebas/base-de-datos.sql` — 20 comprobaciones
- `scripts/pruebas/crm-base-de-datos.sql` — 15 comprobaciones (nuevo)

Lo que se prueba del embudo:

- Que la primera conversación cree la tarjeta, que la segunda **no** la duplique, y que solo nazca una nueva cuando la anterior ya se cerró.
- Que cerrar el chat **no** cierre la venta.
- Que el estado ganado/perdido se derive de la etapa y nunca se pueda escribir a mano.
- Que arrastrar calcule bien la posición: que una tarjeta no se tome a sí misma como vecina, que un índice fuera de rango no rompa nada, y que una columna con 320 tarjetas de las que solo se ven 50 **no pierda la cuenta** al mover una.
- Que una tarea *para hoy* no aparezca en rojo a media tarde.
- Que sin importe **no se pinte un "$0"** falso.
- Contra la base real: que un cliente no pueda ver ni mover el embudo de otro, y que borrar un cliente no deje tarjetas, tareas ni historial huérfanos.

También cerré tres funciones internas del CRM que quedaban abiertas. *(La misma trampa de siempre: Postgres le da permiso a PUBLIC por defecto y `anon` hereda de PUBLIC, así que quitárselo solo a `anon` no sirve de nada.)*

---

## 8. Pendientes que quedan

**Del CRM** (lo siguiente que yo haría, en este orden):

- **Reparto automático** de chats: round robin, solo a agentes conectados, y al que menos conversaciones abiertas tenga. Es lo que respond.io hace mejor que nadie y Kommo directamente no tiene.
- **Macros**: un botón que a la vez asigna, etiqueta, mueve de etapa, manda un mensaje y cierra.
- **Nota de cierre** con categoría obligatoria y resumen escrito por la IA.
- **Fusión de contactos** entre canales (la misma persona por WhatsApp e Instagram), sugerida y reversible.
- **Motivo de pérdida** al mover una tarjeta a una etapa de "se perdió".

**De antes:**

- Recorrido en navegador. Las pruebas no ven nada visual; cuando quieras manejo tu Chrome y recorro pantalla por pantalla.
- Exportar resultados a Excel/PDF.
- Límite de agentes por plan: se cuenta pero no se bloquea.
- Webhook de Stripe para activar los complementos tras el pago.
- Realtime de Supabase en vez del sondeo cada 8 segundos.
- Secciones de BotPenguin que faltan: Perfil de WhatsApp, Integraciones de terceros, Plantillas de flujo.
- Programa de partners (acordado: al final).

**Aparte:** el bot que aprende de lo que no supo responder — lo que hablamos como diferenciador real. Queda apuntado para después de esto.
