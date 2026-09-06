# Notas de diseño: el agente con herramientas

Este archivo no se despliega. Está aquí para que quien toque `index.ts` dentro
de seis meses entienda por qué el ciclo de herramientas está escrito así.

## La idea

Hasta la v32, el bloque de IA solo sabía hablar: se le mandaba personalidad,
conocimiento e historial, y devolvía texto. Un cliente que quería «un agente que
agende solo» tenía que armar un flujo con bloques.

Con herramientas, el modelo puede decir «quiero llamar a `agendar_cita` con
estos datos». Nosotros la ejecutamos, le devolvemos el resultado, y sigue.

## La regla que sostiene todo

**La capacidad es código; la política es dato del cliente.**

- La herramienta `etiquetar` es la misma para todos.
- Las etiquetas que puede poner salen del catálogo de ESE cliente (`tags`).
- Cuándo ponerlas lo escribe el cliente en español en su configuración.

Una clínica dental y una inmobiliaria califican distinto, y ninguna de las dos
necesita que programemos su criterio.

## Por qué se valida en el servidor

El modelo puede inventarse una etiqueta que no existe. Si la aceptáramos, cada
cliente acabaría con etiquetas fantasma y su embudo dejaría de significar nada.

Así que **toda llamada se valida contra el catálogo del cliente antes de
ejecutarse**, y si no cuadra se le devuelve al modelo un error explicando qué
etiquetas sí existen. La IA propone; la base decide.

Lo mismo con `guardar_dato` (solo atributos que el cliente creó) y con
`consultar_sistema` (solo la URL que el cliente configuró — el modelo no elige
a dónde se llama).

## Por qué hay un tope de vueltas

Un modelo puede quedarse pidiendo herramientas en bucle. Esto corre dentro del
webhook de Meta, que reintenta si tardamos. Cuatro vueltas es de sobra para
«mira horarios → agenda → confirma» y corta cualquier bucle.

## Por qué las herramientas de escritura van al final

`agendar_cita`, `etiquetar` y `guardar_dato` cambian datos del negocio. Si el
ciclo se corta a la mitad, lo hecho está hecho: no hay deshacer. Por eso cada
una es idempotente donde puede serlo (agendar re-verifica el hueco; etiquetar
usa un conjunto) y por eso el tope de vueltas es bajo.
