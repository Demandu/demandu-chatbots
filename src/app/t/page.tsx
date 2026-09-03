import { DOMINIO_TIENDAS } from "@/lib/tienda/direccion";

/**
 * La raíz del dominio de tiendas.
 *
 * NO ES UNA TIENDA DE NADIE, así que no puede quedarse en blanco ni dar un
 * error feo: aquí llega quien recorta el enlace por curiosidad, y también
 * cualquier robot que rastree el dominio.
 */
export default function RaizDeTiendas() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        background: "#0d0d34",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ fontSize: "1.1rem", fontWeight: 700 }}>{DOMINIO_TIENDAS}</p>
        <p style={{ marginTop: ".5rem", opacity: 0.7, fontSize: ".9rem" }}>
          Aquí viven las tiendas hechas con Demandu. Para entrar en una, usa el enlace que te dio el
          negocio.
        </p>
        <p style={{ marginTop: "1.5rem", fontSize: ".8rem", opacity: 0.5 }}>
          <a href="https://demandu.tech" style={{ color: "inherit" }}>
            demandu.tech
          </a>
        </p>
      </div>
    </main>
  );
}
