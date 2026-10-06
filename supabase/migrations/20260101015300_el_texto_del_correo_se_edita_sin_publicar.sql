-- El texto de los correos de la plataforma, editable sin tocar el código.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ SALE DEL CÓDIGO.
--
-- El correo de bienvenida estaba escrito dentro de `plantillas.ts`. Corregir
-- una coma —o cambiar «14 días de prueba» el día que sean 7— exigía editar el
-- repositorio, pasar las pruebas y publicar. Para un texto que se corrige
-- leyéndolo, eso es una barrera que garantiza que se quede mal escrito.
--
-- ── LO QUE **NO** SALE DEL CÓDIGO, Y ES DELIBERADO ────────────────────────
--
-- El armazón (los colores, el logo, la caja, el pie) se queda en el código.
-- Aquí solo viven cuatro campos de texto: asunto, título, cuerpo y botón. Un
-- editor que permitiera tocar el HTML sería un editor con el que se puede
-- romper el correo de todos los clientes desde el navegador, sin pruebas y sin
-- revisión — y un correo roto no se puede recoger.
--
-- El cuerpo se guarda como TEXTO LLANO. Se escapa al pintarlo, y lo único que
-- se interpreta es la línea en blanco (párrafo) y `*así*` (negrita).
--
-- ── LA FILA PUEDE NO ESTAR ────────────────────────────────────────────────
--
-- El código trae su propio texto de respaldo y lo usa si esta tabla está vacía,
-- si un campo quedó en blanco o si la base no contesta. Que la plataforma pueda
-- mandar la bienvenida no puede depender de que alguien haya entrado alguna vez
-- a una pantalla.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.correos_plantillas (
  -- 'bienvenida'. Es la clave y no un id: solo hay una plantilla por correo, y
  -- que la clave sea el nombre impide que existan dos «bienvenidas» a la vez.
  clave           text primary key,
  asunto          text not null default '',
  titulo          text not null default '',
  cuerpo          text not null default '',
  boton           text not null default '',
  actualizado_por uuid references auth.users(id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.correos_plantillas enable row level security;

-- ── NI UNA POLÍTICA, COMO EN `correos_enviados` ───────────────────────────
--
-- Esto lo lee y lo escribe el servidor con la llave de servicio: lo lee la
-- tarea de bienvenida y lo escribe la pantalla del superadmin, que ya entra con
-- esa llave. Ningún cliente tiene nada que hacer aquí — es el texto que reciben
-- TODOS los negocios, no el suyo.
--
-- Con RLS activo y sin políticas, `authenticated` y `anon` no ven ni una fila.

comment on table public.correos_plantillas is
  'El texto editable de los correos que manda la plataforma. El armazón y el logo siguen en el código: aquí solo hay palabras.';

-- LA FILA SE CREA VACÍA A PROPÓSITO Y NO CON EL TEXTO DE HOY COPIADO.
--
-- Si se copiara aquí, mañana habría dos textos por defecto —el de la base y el
-- del código— y el día que alguien mejore el del código nadie lo recibiría,
-- porque esta fila lo estaría tapando en silencio. Vacío significa «usa el del
-- código», que es exactamente lo que hay que decir hasta que alguien lo cambie.
insert into public.correos_plantillas (clave)
values ('bienvenida')
on conflict (clave) do nothing;
