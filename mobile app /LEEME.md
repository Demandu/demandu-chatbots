# Demandu · App móvil (iPhone) — v1

La plataforma, en el bolsillo del dueño del negocio. Hecha en SwiftUI, conectada al
mismo Supabase que la web (proyecto "Demandu Chatbot") y a `platform.demandu.tech`.

## Qué hace esta primera versión

| Pestaña | Qué puedes hacer |
|---|---|
| **Entrar** | Iniciar sesión con el mismo correo y contraseña de la computadora. "Se me olvidó la contraseña" manda el correo de recuperación. |
| **Inicio** | Saludo de Lana, cuántos clientes piden hablar con una persona, conversaciones de la semana, % que contestó el bot, citas por venir, leads nuevos, vendido hoy. Accesos rápidos. |
| **Chats** | Bandeja con filtros (Todas · Esperan persona · Bot · Sin leer) y buscador. Dentro de cada chat: el **interruptor de Lana** arriba (encendida = contesta el bot; apagada = la llevas tú), los mensajes, y la caja para responder. Lo que escribes **sí le llega al cliente** por WhatsApp/Instagram (usa la ruta `/api/canales/enviar` de la web). |
| **Pedidos** | Cada tarjeta es un pedido. El botón rosado lo mueve al siguiente paso ("Confirmar pedido", "Ya lo estoy preparando", "Ya salió", "Ya lo entregué") y la web le avisa al cliente por WhatsApp. "Cancelar" siempre pregunta antes. "Ya me pagó por otra vía" para cobros fuera de Yappy. |
| **Citas** | La agenda por día (tira de 14 días + pasadas), con estado (Confirmada / Sin confirmar / Cancelada), botón "Escribirle" y "Ver en calendario". |
| **Ficha del cliente** | Desde un chat: compras, cuánto ha gastado, lo que más se lleva, sus citas, notas del equipo (puedes escribir una nueva). |
| **Ajustes** | Tu negocio, tu cuenta, enlaces a lo que se configura en la computadora, cerrar sesión. |

Lo que **no** está todavía (siguiente versión): notificaciones push, editar el bot desde el
teléfono, conectar WhatsApp desde el teléfono, mover/cancelar citas desde la app.

## Carpetas

```
mobile app/
├── DemanduMovil.xcodeproj/        ← esto es lo que abres en Xcode
├── DemanduMovil/                  ← el código
│   ├── App/DemanduApp.swift       ← arranque + barra de pestañas
│   ├── Core/                      ← Supabase, sesión, tema, llamadas a la web
│   ├── Models/Modelos.swift       ← tablas de Supabase como structs
│   ├── Components/                ← tarjetas, píldoras, botones…
│   ├── Features/                  ← una carpeta por pantalla
│   └── Assets.xcassets/           ← icono, Lana, logo
├── cambios-web/                   ← 2 archivos que hay que subir al repo de la web
├── cambios-web.patch              ← lo mismo, en formato parche
└── LEEME.md
```

---

## PARTE 1 · Abrir y correr la app en Xcode (paso a paso)

Necesitas: una Mac con **Xcode 16 o más nuevo** e internet (Xcode descarga la librería de Supabase la primera vez).

1. Abre **Finder**.
2. Ve a `Documents → DEMANDU → Plataformas → demandu-chatbots → mobile app`.
3. Haz **doble clic** en `DemanduMovil.xcodeproj`. Se abre Xcode.
4. Espera. Arriba, en la barra de estado de Xcode, verás "Resolving Package Graph…" o "Fetching supabase-swift…". Tarda 1–3 minutos la primera vez. No toques nada hasta que desaparezca.
   - Si aparece una ventana que pregunta si confías en el paquete o en el proyecto, elige **Trust**.
5. En la parte superior de la ventana, a la izquierda del botón ▶, hay un selector de dispositivo. Haz clic ahí y elige **iPhone 16 Pro** (o cualquier simulador de iPhone).
6. Haz clic en el botón **▶ (Run)** arriba a la izquierda, o presiona **⌘R**.
7. La primera compilación tarda 2–5 minutos. Verás "Build Succeeded" y se abre el simulador con la app.
8. En la app, toca **Tu correo**, escribe tu correo de la plataforma; toca **Tu contraseña**, escribe la contraseña; toca **Entrar**.

### Si Xcode marca un error rojo al compilar

- Ve al menú **Product → Clean Build Folder** (⇧⌘K) y vuelve a **⌘R**.
- Si el error dice algo de "package" o "Supabase": menú **File → Packages → Reset Package Caches**, espera, y **⌘R** otra vez.
- Si el error está en un archivo `.swift` (aparece en rojo con una explicación), copia el texto del error tal cual y mándamelo; lo corrijo.

### Para probarla en tu iPhone de verdad (opcional)

1. Conecta el iPhone a la Mac con cable.
2. En Xcode, en el panel izquierdo, haz clic en el **icono azul del proyecto** (arriba de todo, dice "DemanduMovil").
3. En el centro, bajo **TARGETS**, haz clic en **DemanduMovil**.
4. Arriba, haz clic en la pestaña **Signing & Capabilities**.
5. En **Team**, elige tu cuenta de Apple (si no aparece: **Add an Account…** e inicia sesión con tu Apple ID).
6. En el selector de dispositivo (junto al ▶) elige tu iPhone.
7. **⌘R**. En el iPhone, si dice "Desarrollador no confiable": Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar.

---

## PARTE 2 · Subir los 2 cambios a la web (obligatorio para enviar mensajes y mover pedidos)

La app usa dos rutas de `platform.demandu.tech`. Una ya existe (`/api/canales/enviar`), pero la web
solo aceptaba sesión por cookies (navegador). Estos cambios hacen que también acepte el token de la
app, y añaden `/api/movil/pedido` que reutiliza **la misma** lógica del panel para mover pedidos.

Los archivos están en `cambios-web/` con la misma ruta que en el repo `Demandu/demandu-chatbots`:

- `src/lib/supabase/server.ts` → **reemplaza** el que ya existe.
- `src/app/api/movil/pedido/route.ts` → **nuevo** (crea la carpeta `movil/pedido` dentro de `src/app/api/`).

Pasos en la Mac (con la carpeta del repo de la web, la que tiene `publish.sh`):

1. Abre **Finder** y ve a la carpeta `mobile app/cambios-web/src/lib/supabase/`.
2. Copia `server.ts` (⌘C).
3. Ve a la carpeta del repo de la web → `src/lib/supabase/` y pega (⌘V). Cuando pregunte, elige **Reemplazar**.
4. Vuelve a `mobile app/cambios-web/src/app/api/` y copia la carpeta **movil** completa (⌘C).
5. Ve al repo de la web → `src/app/api/` y pega (⌘V).
6. Abre **Terminal**, escribe `cd ` (con un espacio), arrastra la carpeta del repo de la web a la ventana de Terminal y presiona **Enter**.
7. Escribe `./publish.sh` y presiona **Enter**. Netlify publica solo en unos minutos.

Hasta que esto esté publicado, en la app verás el aviso "La web todavía no tiene esta función
publicada" al enviar un mensaje o mover un pedido. Todo lo demás (ver chats, encender/apagar a
Lana, pedidos, citas, ficha, notas) funciona desde el primer momento porque va directo a Supabase.

---

## Cómo funciona por dentro (para el futuro tú)

- **Sesión**: `Sesion.swift`. Al entrar, busca tus `memberships`, elige la cuenta activa con la
  misma regla que la web (la propia antes que una de soporte), carga `organizations` y la `tienda`.
- **Lana encendida / apagada** = `conversations.status` `open` / `assigned`. Es la misma regla que
  el motor de WhatsApp: con `assigned` el bot se calla.
- **Esperan persona** = `handoff_requested_at` con valor y status distinto de `assigned`.
- **Dinero**: en la base va en centavos enteros; `Dinero.texto()` lo pinta.
- **Colores y tipografía**: `Theme.swift`, sacados del prototipo (`DemanduAppMovil.html`).
  Si quieres la fuente **Sora** igual que en la web: arrastra los `.ttf` de Sora a la carpeta
  `DemanduMovil` en Xcode (marca "Copy items if needed") y añade en el target, pestaña **Info**,
  la clave `Fonts provided by application` con los nombres de archivo. El código ya la detecta.
- **Los mensajes se refrescan solos** cada 4 segundos mientras el chat está abierto (mismo
  método que el widget web). Jala hacia abajo en cualquier lista para actualizar.
