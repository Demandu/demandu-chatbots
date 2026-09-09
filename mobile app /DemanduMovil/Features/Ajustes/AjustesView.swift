import SwiftUI

/// Ajustes: el negocio, tu cuenta, y los accesos a lo que se configura en la computadora.
struct AjustesView: View {
    @Environment(Sesion.self) private var sesion
    @State private var confirmarSalir = false

    private var rol: String {
        switch sesion.membresia?.role ?? "" {
        case "owner": return "Dueño"
        case "admin": return "Administrador"
        case "agent": return "Agente"
        case "viewer": return "Solo lectura"
        case "developer": return "Desarrollador"
        case "coordinador": return "Coordinador"
        default: return (sesion.membresia?.role ?? "").capitalized
        }
    }

    var body: some View {
        Pantalla {
            ScrollView {
                VStack(spacing: 12) {
                    Encabezado(titulo: "Ajustes", subtitulo: sesion.organizacion?.name ?? "")

                    VStack(spacing: 12) {
                        // Negocio
                        VStack(alignment: .leading, spacing: 10) {
                            seccion("Tu negocio")
                            fila("Nombre", sesion.organizacion?.name ?? "—")
                            fila("Plan", (sesion.organizacion?.plan ?? "—").capitalized)
                            if let t = sesion.tienda {
                                fila("Tienda", "store.demandu.tech/\(t.slug)")
                            }
                            if let z = sesion.organizacion?.timezone { fila("Zona horaria", z) }
                        }
                        .tarjeta()

                        // Cuenta
                        VStack(alignment: .leading, spacing: 10) {
                            seccion("Tu cuenta")
                            fila("Correo", sesion.usuarioEmail)
                            fila("Rol", rol)
                        }
                        .tarjeta()

                        // Lo que se hace en la computadora
                        VStack(alignment: .leading, spacing: 10) {
                            seccion("Se configura en la computadora")
                            Text("El teléfono es para atender. Para cambiar cómo funciona todo, entra a la plataforma.")
                                .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
                            enlace("Chatbots y pasos del bot", "bots")
                            enlace("Mi tienda y productos", "tienda")
                            enlace("Conectar WhatsApp o Instagram", "settings")
                            enlace("Resultados completos", "analytics")
                            enlace("Plantillas y avisos de WhatsApp", "campaigns")
                        }
                        .tarjeta()

                        // Avisos
                        VStack(alignment: .leading, spacing: 10) {
                            seccion("Avisos en el teléfono")
                            Text("Las notificaciones push (cuando alguien pide persona o entra un pedido) llegan en la siguiente versión. Por ahora, jala hacia abajo en cada pantalla para actualizar.")
                                .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
                        }
                        .tarjeta()

                        Button("Cerrar sesión") { confirmarSalir = true }
                            .buttonStyle(BotonSecundarioStyle())
                            .padding(.top, 6)

                        Text("Demandu · app móvil v\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")")
                            .font(Theme.cuerpo(11.5)).foregroundStyle(Theme.textoSuave)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 4)
                    }
                    .padding(.horizontal, 18)
                }
                .padding(.bottom, 24)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .confirmationDialog("¿Cerrar sesión?", isPresented: $confirmarSalir, titleVisibility: .visible) {
            Button("Sí, salir", role: .destructive) { Task { await sesion.salir() } }
            Button("Quedarme", role: .cancel) {}
        }
    }

    private func seccion(_ t: String) -> some View {
        Text(t.uppercased()).font(Theme.cuerpo(11, peso: .semibold)).tracking(1.2).foregroundStyle(Theme.textoEtiqueta)
    }

    private func fila(_ etiqueta: String, _ valor: String) -> some View {
        HStack(alignment: .top) {
            Text(etiqueta).font(Theme.cuerpo(14)).foregroundStyle(Theme.textoSuave)
            Spacer()
            Text(valor).font(Theme.cuerpo(14, peso: .semibold)).foregroundStyle(Theme.texto).multilineTextAlignment(.trailing)
        }
    }

    private func enlace(_ titulo: String, _ ruta: String) -> some View {
        Link(destination: Backend.plataforma.appendingPathComponent(ruta)) {
            HStack {
                Text(titulo).font(Theme.cuerpo(14, peso: .semibold)).foregroundStyle(Theme.texto)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textoSuave)
            }
            .padding(.vertical, 4)
        }
    }
}
