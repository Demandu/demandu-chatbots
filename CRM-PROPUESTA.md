# CRM en Demandu — qué copiar, qué no, y por qué ahora

Investigación de agosto de 2026 sobre Kommo, respond.io, Botmaker, Leadsales, Chatwoot, HubSpot, Intercom y Pipedrive. El objetivo no es tener "un CRM": es decidir qué pedazo del CRM nos vuelve difíciles de reemplazar.

---

## 1. El hueco, en tres frases

**respond.io se niega a ser CRM.** Lo dicen ellos, literal: *"si estás evaluando respond.io como CRM — un lugar para guardar registros, gestionar tu embudo o ser dueño de los datos de tus clientes — no es la herramienta adecuada"*. Y su queja número 1 en G2, con 18 menciones, es exactamente ésa: **no tiene embudo**.

**Kommo sí es CRM, pero se está encareciendo y encadenando.** El 1 de septiembre de 2026 —en dos semanas— su plan de entrada sube de $15 a $25 por usuario al mes, un 67%. No tiene plan mensual: **el mínimo son 6 meses**, sin reembolso. Sus quejas recurrentes son soporte lento, leads duplicados y costos ocultos (widgets de $5–20/mes por separado).

**Botmaker directamente no juega aquí.** Es enterprise (Ford, Mercado Libre, Gobierno de Buenos Aires), su plan de entrada son $149/mes, y su estrategia declarada es integrarse a Salesforce o HubSpot, no reemplazarlos. En su página de funciones no aparece ni embudo, ni tarjeta de oportunidad, ni tareas.

**El competidor real es Leadsales** (mexicano, ~2.800 clientes, $84–133/mes por 3–4 usuarios). Tiene el embudo Kanban que la pyme entiende. Lo que no tiene: un bot decente (sus propios comparadores admiten que *"el Leadbot es básico comparado con el Salesbot de Kommo"*), envíos masivos, ni email. Sus reseñas en Capterra (3.9/5) se quejan de mensajes que se pierden y de cobros después de darse de baja.

> **La lectura**: Leadsales tiene el embudo y un bot flojo. Nosotros tenemos el bot bueno y no tenemos embudo. Ese es el intercambio que hay que romper, y hay una ventana de dos semanas en la que Kommo le sube el precio a todo su mercado.

---

## 2. Dónde está parada cada uno

| | Embudo Kanban | Bot / IA | Reparto automático | Masivos WA | Precio entrada | Cómo cobra |
|---|:--:|:--:|:--:|:--:|---|---|
| **Kommo** | ✅ hasta 50 | ✅ Salesbot + agente IA | ⚠️ truco del bot | ✅ | $15 → **$25** (1-sep) | por usuario, mín. 6 meses |
| **respond.io** | ❌ (rechazado a propósito) | ✅ Workflows + AI Agents | ✅✅ el mejor del mercado | ✅ | $79 (5 usuarios) | por contacto activo (MAC) |
| **Botmaker** | ❌ | ✅✅ | — | ✅ | $149 | por conversación |
| **Leadsales** | ✅ | ⚠️ básico | ✅ | ❌ | $84 (3 usuarios) | por paquete de usuarios |
| **Demandu hoy** | ❌ | ✅✅ RAG por bot | ❌ | ✅ | $59 | **por mensaje saliente** |

Nuestro modelo de cobro es el único que no castiga meter más vendedores. Eso importa para lo que sigue: **un CRM empuja a sumar usuarios, y a todos los demás eso les sube la factura**. A nosotros no. Es un argumento de venta que ninguno puede copiar sin rehacer su negocio.

---

## 3. La decisión que hay que tomar bien: ¿la conversación es la oportunidad?

Es la decisión de modelado más cara de deshacer. Las tres posturas del mercado:

- **Kommo las funde**: cada mensaje entrante se convierte en un lead del embudo. Resultado: el embudo se llena de "¿tienen estacionamiento?" y de leads duplicados. Existe una industria de widgets de terceros solo para limpiar duplicados en Kommo.
- **respond.io las separa pero renuncia al embudo**: modela "etapas de ciclo de vida" en el contacto y le manda el resultado a tu CRM de verdad. Solo que la pyme mexicana no tiene HubSpot ni lo va a comprar.
- **HubSpot, Pipedrive e Intercom las separan de verdad**, con objetos distintos. En el foro de HubSpot un empleado advierte que auto-crear un objeto por cada conversación *"puede inflar falsamente cuántos casos reales se están atendiendo"*, y hay usuarios que terminaron **apagando la creación automática**.

**Lo que propongo: tres objetos, con la oportunidad creada sola pero no por cada chat.**

```
Contacto  ──<  Conversación   (ciclo de vida: horas. Es la cola de trabajo del agente)
    └─────<  Oportunidad      (ciclo de vida: semanas. Es el embudo del dueño)
```

Con dos reglas que son las que evitan el problema de Kommo:

1. **Si el contacto ya tiene una oportunidad abierta, la conversación se cuelga de ésa.** No se crea otra.
2. **Solo se crea una oportunidad nueva si la anterior ya está cerrada** (ganada o perdida). Así el cliente que vuelve a los tres meses genera una tarjeta nueva —que es lo correcto— y el que escribe cinco veces esta semana genera una sola.

Y una regla más, que el mercado documenta como error clásico: **cerrar la conversación nunca cierra la oportunidad.** Son cosas distintas. El agente cierra el chat cuando terminó de atender; el dueño cierra la venta cuando cobró.

La buena noticia: **ya hicimos la mitad de esto sin querer.** `conversations.status` (abierta/pendiente/asignada/cerrada) es la cola del agente, y `conversation_states` —los estados que el cliente inventa— ya es un embudo disfrazado. La semana pasada le agregamos `outcome` (ganado/perdido). Lo que falta es despegarlo de la conversación y colgarlo de una oportunidad.

---

## 4. Las diez prácticas que sí vale la pena copiar

Ordenadas por valor sobre esfuerzo. Las cinco primeras son las que yo haría.

### 1. Embudo Kanban arrastrable, con varios embudos
**De Kommo y Leadsales.** Es *la* metáfora que la pyme hispanohablante entiende: columnas, arrastrar, "no se me escapa ningún cliente". Kommo permite hasta 50 embudos por cuenta; Leadsales de 5 a ilimitados según plan. Detalle que Kommo hace bien y hay que copiar: **las etapas de cierre no se pueden borrar ni mover**, solo renombrar, y al borrar una etapa con tarjetas te obliga a decir a dónde van.

### 2. Etapas de "perdido" separadas de las del embudo
**De respond.io.** No son la última columna: son una categoría aparte (no calificado, sin respuesta, se fue con la competencia) que **se excluye del embudo** y alimenta su propio reporte de fuga, con "tiempo promedio hasta la pérdida". Es analítica de por qué perdemos, prácticamente gratis, y encaja directo en la pantalla de Resultados que acabamos de construir.

### 3. Tareas con vencimiento, y alerta de "lead sin próxima tarea"
Esto es *el* miedo del vendedor latinoamericano, y ninguno lo resuelve bien. Kommo tiene tareas pero su vigilancia es tan floja que existen widgets de terceros que solo sirven para avisarte de leads sin tarea pendiente. La regla que vale oro es la inversa de la que todos implementan: **no avisar de tareas vencidas, avisar de tarjetas sin ninguna tarea agendada.** Un lead sin próximo paso es un lead perdido y nadie lo está mirando.

### 4. Reparto automático de verdad
**De respond.io, que es el mejor del mercado en esto.** No basta el round robin: hay que copiar los tres modificadores que lo hacen funcionar en la vida real:
- **Solo repartir a agentes conectados** (si no, el chat cae en el buzón del que se fue a comer).
- **Balanceo por carga**: al que menos conversaciones abiertas tenga, no al que le toca.
- **Umbral "menos de X abiertas"** + cola de espera con caducidad configurable. Sin esto, el round robin le sigue mandando chats al agente saturado.

Kommo no tiene nada de esto: su "round robin" es un paso del bot que rota acciones. Este es un hueco grande y barato de llenar.

### 5. Macros: un clic que hace cinco cosas
**De Chatwoot.** Un botón que a la vez asigna, etiqueta, cambia de etapa, manda un mensaje y cierra. Chatwoot define exactamente 8 acciones y permite que la macro sea pública para todo el equipo o privada. El truco de diseño: **la macro y la automatización comparten el mismo motor de acciones**; una la dispara el agente, la otra un evento. Se construye una vez.

Ganan por dos razones: le ahorran seis clics al agente, y hacen que la analítica sea confiable —porque la etiqueta, la etapa y la asignación quedan siempre iguales.

### 6. Nota de cierre con categoría obligatoria y resumen de IA
**De respond.io.** Al cerrar una conversación se pide una categoría (consulta general, venta, problema de pago…) y opcionalmente un resumen. El resumen **lo escribe la IA leyendo los últimos 100 mensajes**, editable. Configurable en tres niveles: ambos opcionales, categoría obligatoria, o categoría y resumen obligatorios.

Es la mejor relación valor/esfuerzo de toda la lista para nosotros: ya tenemos IA con contexto de la conversación, y el "¿por qué se cerró?" es el dato analítico que casi nadie captura.

### 7. Separar "tardamos en asignar" de "el agente tardó en responder"
**De respond.io.** Ellos miden por separado: tiempo hasta la primera asignación, de la primera asignación a la primera respuesta, de la última asignación al cierre. Nosotros ya medimos el tiempo de respuesta del agente; con un registro de eventos de asignación sale el resto casi solo. Es la diferencia entre "mi equipo es lento" y "el chat estuvo cuarenta minutos sin dueño".

### 8. Fusión de contactos entre canales, sugerida y reversible
El mismo humano que escribe por WhatsApp y por Instagram hoy son dos contactos, y lo van a seguir siendo: Meta no entrega ni teléfono ni correo por Instagram. Nadie lo resuelve automático. Lo que sí se puede copiar es **cómo lo hace respond.io**: detecta por teléfono y correo, **sugiere** la fusión, la revisa un humano, conserva las propiedades y los canales de ambos, y —esto es lo raro y valioso— **permite deshacerla**. ManyChat lo hace al revés: fusión manual, irreversible, y borra el historial del secundario.

Regla dura: **nunca fusionar solo, siempre sugerir.** Chatwoot tiene un fallo abierto donde dos contactos distintos se fusionan por compartir correo y *"toda la información del segundo cliente se pierde"*. Se cerró como "no planeado".

### 9. Atajos que el agente dispara desde el chat
**De respond.io.** Un botón dentro de la conversación que lanza un flujo, con un formulario opcional cuyos campos quedan como variables. Convierte las automatizaciones en herramientas del agente, no solo en algo que pasa solo. Barato de construir, y cambia por completo la sensación de la bandeja.

### 10. Facturación local (CFDI con timbrado SAT)
No es una función de CRM, es un foso. **Leadsales es la única del mercado que emite CFDI**, y en las guías de compra mexicanas aparece como criterio de decisión explícito: sin factura deducible, el gasto no pasa por contabilidad. Ningún proveedor extranjero lo hace. Vale más que tres funciones juntas para vender en México.

---

## 5. Lo que NO hay que construir

Todo esto se vende bien y no lo usa nadie en una empresa de tres vendedores:

- **Lead scoring y pronóstico ponderado por probabilidad.** Requieren disciplina de datos que la pyme no tiene. Gartner proyecta que el 40% de los proyectos de CRM con agentes fallará por calidad de datos, no por tecnología.
- **Jerarquía obligatoria empresa → contacto → oportunidad.** En B2C es puro estorbo. Que la empresa sea un campo, no un objeto con vida propia.
- **Campos personalizados ilimitados.** Textual, de un hilo de Hacker News sobre por qué fracasan los CRM: *"los campos personalizados… probablemente son una de las mayores ruinas de los CRM"*. Pocos, obligatorios y con tipo. Nosotros ya tenemos atributos personalizados: la tentación va a ser dejar que el cliente cree cuarenta. Hay que resistirla.
- **Reportes configurables por el usuario.** Se piden en la demo y no se abren nunca. Mejor cinco reportes buenos.
- **Asumir que toda venta es un embudo lineal.** Otro hilo del mismo foro: *"las ventas no necesariamente se modelan como un embudo"*. Una estética, una refaccionaria o una clínica venden por recompra, no por etapas. Si el embudo es obligatorio, se les va a sentir ajeno.

---

## 6. Cómo se cobra esto

Los tres modelos que conviven en el mercado hispanohablante:

- **Por usuario**: Kommo $15→$25, Zoho $14–20, Pipedrive $24.
- **Por paquete con usuarios incluidos**: Whaticket $49 (3 agentes), Leadsales $84 (3), respond.io $79 (5).
- **Por conversación**: Botmaker $149–499, Cliengo $45–259, Zenvia $130–845.

El rango de entrada real para pyme LATAM es **$39–99 USD/mes**. Cruzar los $130 exige justificar API oficial, masivos e IA. El presupuesto mental declarado en las guías mexicanas ronda los **MXN 500–1.500/mes**.

Nosotros estamos en $59/$99/$179 cobrando por mensaje saliente, que sigue siendo la decisión correcta —Meta cobra por mensaje desde el 1 de octubre—. **Mi recomendación: el CRM no es un plan aparte ni un complemento.** Es lo que hace que Crece ($99) deje de ser "más mensajes" y pase a ser "más mensajes *y* el embudo". Lo que se monetiza alrededor son los asientos de agente ($25/mes, margen casi total), y un CRM es precisamente lo que hace que un cliente pase de dos vendedores a cinco.

Además hay un argumento que ninguno de los cuatro puede usar: **con nosotros meter un vendedor más no encarece la plataforma por vendedor**. A Kommo le cuesta $25 al mes por cabeza; a nosotros el asiento es un complemento opcional sobre una cuota de mensajes que ya está pagada.

---

## 7. Qué tenemos ya (inventario honesto)

| Pieza del CRM | Estado |
|---|---|
| Contactos con atributos personalizados | ✅ |
| Etiquetas | ✅ |
| Estados de conversación por cliente | ✅ (ya son un embudo disfrazado) |
| Ganado / perdido por estado | ✅ (se hizo esta semana) |
| Asignación a un agente | ✅ manual |
| Notas internas con autor y fecha | ✅ post-it |
| Respuestas rápidas | ✅ |
| Analítica de equipo y tiempo de respuesta | ✅ (esta semana) |
| **Embudo Kanban arrastrable** | ❌ |
| **Oportunidad como objeto** | ❌ |
| **Tareas y recordatorios** | ❌ |
| **Reparto automático** | ❌ |
| **Macros** | ❌ |
| **Nota de cierre con categoría** | ❌ |
| **Fusión de contactos entre canales** | ❌ |

Estamos más cerca de lo que parece. Lo que falta no es un CRM entero: son seis piezas.

---

## 8. Orden que propongo

**Primero — el embudo (2 semanas).** Oportunidades como objeto, tablero Kanban arrastrable, varios embudos, etapas de pérdida aparte. Es lo que se ve en la demo y lo que cierra la venta. Reutiliza `conversation_states` y el `outcome` que ya existen.

**Segundo — que no se escape nadie (1 semana).** Tareas con vencimiento sobre la tarjeta, y la alerta de "esta tarjeta no tiene próximo paso". Es la promesa emocional de la categoría.

**Tercero — la operación del equipo (1–2 semanas).** Reparto automático con agentes en línea y balanceo por carga, macros de un clic, nota de cierre con categoría y resumen de IA.

**Cuarto — identidad y afinado.** Fusión sugerida de contactos entre canales, métricas de asignación, atajos disparados por el agente.

**Aparte y en paralelo — CFDI.** No es código nuestro, es un proveedor de timbrado. Si queremos México en serio, esto pesa más que cualquiera de las funciones de arriba.

---

## Fuentes

- [Kommo — precios y aviso de aumento del 1-sep-2026](https://www.kommo.com/blog/kommo-pricing/) · [planes](https://www.kommo.com/buy/tariff/) · [embudos](https://support.kommo.com/docs/set-up-a-pipeline) · [disparadores del Salesbot](https://www.kommo.com/support/crm/salesbot-triggers/) · [reseñas G2](https://www.g2.com/products/kommo/reviews) · [Trustpilot](https://ca.trustpilot.com/review/kommo.com)
- [respond.io — "¿somos un reemplazo de CRM?"](https://respond.io/faqs/is-respondio-a-crm-replacement-or-does-it-work-alongside-it) · [asignación y balanceo de carga](https://respond.io/help/workflows/step-assign-to) · [fusión de contactos](https://respond.io/blog/merge-contacts) · [reportes de conversaciones](https://respond.io/help/dashboard-reporting/reports-conversations) · [ciclo de vida](https://respond.io/help/workspace-settings/workspace-settings-lifecycle) · [precios](https://respond.io/pricing) · [reseñas G2](https://www.g2.com/products/respond-io/reviews)
- [Botmaker — precios](https://botmaker.com/precios/) · [funciones](https://botmaker.com/es/plataforma/funciones/) · [integración con Salesforce](https://help.botmaker.com/es/help/4289137941119083136) · [reseñas G2](https://www.g2.com/products/botmaker/reviews)
- [Leadsales — precios 2026](https://www.eligetucrm.com/blog/leadsales-precios-2026) · [comparativa](https://www.comparasoftware.com/leadsales) · [reseñas Capterra](https://www.capterra.com/p/215729/Leadsales-CRM/reviews/) · [CRM para pymes México](https://www.eligetucrm.com/crm-para-pymes-mexico)
- [Chatwoot — macros](https://www.chatwoot.com/features/macros/) · [SLA](https://www.chatwoot.com/hc/user-guide/articles/1713167310-service-level-agreemtns) · [modelo de datos](https://deepwiki.com/chatwoot/chatwoot/2.1-data-models) · [fusión destructiva, fallo #2811](https://github.com/chatwoot/chatwoot/issues/2811)
- [HubSpot — hilo "Tickets vs Conversations"](https://community.hubspot.com/t5/Tickets-Conversations/Tickets-Vs-Conversations-How-do-you-handle-your-customer-service/td-p/675860) · [Deal vs Ticket](https://community.hubspot.com/t5/Tips-Tricks-Best-Practices/Ticket-vs-Deal/m-p/739322)
- [Pipedrive — leads vs deals](https://support.pipedrive.com/en/article/leads-vs-deals) · [Intercom — tickets](https://www.intercom.com/help/en/articles/6436600-tickets-explained)
- [Hacker News — por qué fracasan los CRM (Launch HN de Twenty)](https://news.ycombinator.com/item?id=36791434)
- [ManyChat — fusión irreversible de contactos](https://help.manychat.com/hc/en-us/articles/14281101369116-How-to-merge-duplicate-contacts)
- [Zenvia — precios](https://zenvia.com/en/prices/) · [Cliengo — precios](https://www.cliengo.com/pricing) · [Wati — precios](https://costbench.com/software/live-chat/wati/)
