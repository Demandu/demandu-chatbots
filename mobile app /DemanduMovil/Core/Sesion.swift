import Foundation
import Observation
import Supabase

/// Quién está dentro, en qué negocio, y los números del inicio.
@Observable
@MainActor
final class Sesion {
    enum Estado { case cargando, fuera, dentro }

    var estado: Estado = .cargando
    var usuarioEmail: String = ""
    var membresia: Membresia?
    var organizacion: Organizacion?
    var tienda: Tienda?
    var resumen = Resumen()
    var errorGeneral: String?

    private let sb = Backend.client
    var orgId: UUID? { membresia?.orgId }

    // MARK: Arranque y sesión

    func arrancar() async {
        // `auth.session` devuelve la sesión guardada (y la renueva sola si caducó).
        let guardada = try? await sb.auth.session
        if let s = guardada {
            await cargarCuenta(userId: s.user.id, email: s.user.email ?? "")
        } else {
            estado = .fuera
        }
    }

    func entrar(correo: String, contrasena: String) async throws {
        let r = try await sb.auth.signIn(email: correo.trimmingCharacters(in: .whitespaces), password: contrasena)
        await cargarCuenta(userId: r.user.id, email: r.user.email ?? correo)
    }

    func recuperarContrasena(correo: String) async throws {
        try await sb.auth.resetPasswordForEmail(
            correo.trimmingCharacters(in: .whitespaces),
            redirectTo: Backend.plataforma.appendingPathComponent("crear-contrasena")
        )
    }

    func salir() async {
        try? await sb.auth.signOut()
        membresia = nil
        organizacion = nil
        tienda = nil
        resumen = Resumen()
        estado = .fuera
    }

    /// El token que la web de la plataforma acepta como "Authorization: Bearer".
    func token() async throws -> String {
        try await sb.auth.session.accessToken
    }

    private func cargarCuenta(userId: UUID, email: String) async {
        usuarioEmail = email
        do {
            let membresias: [Membresia] = try await sb
                .from("memberships")
                .select("id, org_id, user_id, role, created_at, soporte_hasta")
                .eq("user_id", value: userId.uuidString)
                .execute()
                .value

            // La misma regla que la web (`membresiaActiva`): la propia cuenta va
            // antes que una de soporte, y entre iguales, la más antigua.
            let ahora = Date()
            let vivas = membresias.filter { $0.soporteHasta == nil || ($0.soporteHasta ?? ahora) > ahora }
            let elegida = vivas.sorted {
                let a = $0.soporteHasta == nil ? 0 : 1
                let b = $1.soporteHasta == nil ? 0 : 1
                if a != b { return a < b }
                return ($0.createdAt ?? .distantPast) < ($1.createdAt ?? .distantPast)
            }.first

            guard let elegida else {
                errorGeneral = "Tu cuenta todavía no tiene un negocio asociado. Entra primero desde la computadora."
                estado = .fuera
                try? await sb.auth.signOut()
                return
            }
            membresia = elegida

            let org: Organizacion = try await sb
                .from("organizations")
                .select("id, name, plan, contacto_nombre, timezone")
                .eq("id", value: elegida.orgId.uuidString)
                .single()
                .execute()
                .value
            organizacion = org

            let tiendas: [Tienda] = try await sb
                .from("tiendas")
                .select("id, slug, nombre, activa, config")
                .eq("org_id", value: elegida.orgId.uuidString)
                .limit(1)
                .execute()
                .value
            tienda = tiendas.first

            estado = .dentro
            await refrescarResumen()
        } catch {
            errorGeneral = "No pude cargar tu cuenta: \(error.localizedDescription)"
            estado = .fuera
        }
    }

    // MARK: Números del inicio

    func refrescarResumen() async {
        guard let orgId else { return }
        let org = orgId.uuidString
        let cal = Calendar.current
        let ahora = Date()
        let hace7 = cal.date(byAdding: .day, value: -7, to: ahora)!
        let hace14 = cal.date(byAdding: .day, value: -14, to: ahora)!
        let inicioHoy = cal.startOfDay(for: ahora)
        let inicioMes = cal.date(from: cal.dateComponents([.year, .month], from: ahora))!

        var r = Resumen()

        async let convSemana = contar("conversations", org: org) { $0.gte("created_at", value: Fechas.iso(hace7)) }
        async let convAnterior = contar("conversations", org: org) {
            $0.gte("created_at", value: Fechas.iso(hace14)).lt("created_at", value: Fechas.iso(hace7))
        }
        async let esperan = contar("conversations", org: org) {
            $0.filter("handoff_requested_at", operator: "not.is", value: "null").neq("status", value: "assigned").neq("status", value: "closed")
        }
        async let botSemana = contar("messages", org: org) {
            $0.eq("sender", value: "bot").gte("created_at", value: Fechas.iso(hace7))
        }
        async let agenteSemana = contar("messages", org: org) {
            $0.eq("sender", value: "agent").gte("created_at", value: Fechas.iso(hace7))
        }
        async let citas = contar("citas", org: org) {
            $0.eq("estado", value: "agendada").gte("inicio", value: Fechas.iso(ahora))
        }
        async let leads = contar("contacts", org: org) { $0.gte("created_at", value: Fechas.iso(hace7)) }
        async let nuevos = contar("pedidos", org: org) { $0.eq("estado", value: "recibido") }
        async let mensajesMes = contar("messages", org: org) { $0.gte("created_at", value: Fechas.iso(inicioMes)) }
        async let bots = contar("bots", org: org) { $0.eq("status", value: "published") }

        r.conversacionesSemana = await convSemana
        r.conversacionesSemanaAnterior = await convAnterior
        r.esperanPersona = await esperan
        let b = await botSemana, a = await agenteSemana
        r.porcentajeBot = (a + b) == 0 ? 0 : Int((Double(b) / Double(a + b) * 100).rounded())
        r.citasAgendadas = await citas
        r.leadsNuevos = await leads
        r.pedidosNuevos = await nuevos
        r.mensajesMes = await mensajesMes
        r.chatbotsActivos = await bots

        // Vendido hoy: se suman los pedidos pagados de hoy.
        struct Fila: Decodable { let total: Int? }
        if let filas: [Fila] = try? await sb.from("pedidos")
            .select("total")
            .eq("org_id", value: org)
            .eq("pago", value: "pagado")
            .gte("created_at", value: Fechas.iso(inicioHoy))
            .execute().value {
            r.pedidosHoy = filas.count
            r.vendidoHoy = filas.reduce(0) { $0 + ($1.total ?? 0) }
        }

        resumen = r
    }

    private func contar(_ tabla: String, org: String,
                        _ filtros: (PostgrestFilterBuilder) -> PostgrestFilterBuilder) async -> Int {
        let base = sb.from(tabla).select("id", head: true, count: .exact).eq("org_id", value: org)
        let q = filtros(base)
        return (try? await q.execute().count) ?? 0
    }
}
