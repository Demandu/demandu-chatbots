import Foundation
import SwiftUI

// Los modelos siguen las tablas de Supabase. Las claves llegan en snake_case y el
// decodificador las convierte a camelCase (ver Backend.decoder).

struct Organizacion: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String
    let plan: String?
    let contactoNombre: String?
    let timezone: String?
}

struct Membresia: Codable, Identifiable, Hashable {
    let id: UUID
    let orgId: UUID
    let userId: UUID
    let role: String
    let createdAt: Date?
    let soporteHasta: Date?
}

struct Contacto: Codable, Identifiable, Hashable {
    let id: UUID
    let name: String?
    let phone: String?
    let email: String?
    let waName: String?
    let channel: String?
    let tags: [String]?
    let company: String?
    let country: String?
    let notes: String?
    let createdAt: Date?

    var nombreVisible: String {
        let n = (name ?? "").trimmingCharacters(in: .whitespaces)
        if !n.isEmpty { return n }
        let w = (waName ?? "").trimmingCharacters(in: .whitespaces)
        if !w.isEmpty { return w }
        return phone ?? "Sin nombre"
    }

    var iniciales: String {
        let partes = nombreVisible.split(separator: " ").prefix(2)
        let letras = partes.compactMap { $0.first }.map { String($0).uppercased() }
        return letras.isEmpty ? "?" : letras.joined()
    }
}

/// Lo mínimo del contacto que viaja junto a cada conversación.
struct ContactoResumen: Codable, Hashable {
    let id: UUID
    let name: String?
    let phone: String?
    let waName: String?

    var nombreVisible: String {
        let n = (name ?? "").trimmingCharacters(in: .whitespaces)
        if !n.isEmpty { return n }
        let w = (waName ?? "").trimmingCharacters(in: .whitespaces)
        if !w.isEmpty { return w }
        return phone ?? "Sin nombre"
    }
    var iniciales: String {
        let partes = nombreVisible.split(separator: " ").prefix(2)
        let letras = partes.compactMap { $0.first }.map { String($0).uppercased() }
        return letras.isEmpty ? "?" : letras.joined()
    }
}

struct Conversacion: Codable, Identifiable, Hashable {
    let id: UUID
    let orgId: UUID
    let contactId: UUID?
    let botId: UUID?
    let channel: String
    var status: String            // open · pending · assigned · closed
    var unread: Int?
    var handoffRequestedAt: Date?
    var handoffReason: String?
    let lastMessageAt: Date?
    let createdAt: Date?
    let contact: ContactoResumen?
    var ultimo: [Mensaje]?         // se pide con `messages(...)` limitado a 1

    /// La IA (Lana) contesta mientras la conversación esté "open"; cuando una
    /// persona la toma pasa a "assigned" y el bot se calla. Es la misma regla
    /// que usa el motor de WhatsApp.
    var laLlevaUnaPersona: Bool { status == "assigned" }
    var esperaPersona: Bool { handoffRequestedAt != nil && status != "assigned" && status != "closed" }
    var cerrada: Bool { status == "closed" }

    var nombre: String { contact?.nombreVisible ?? "Sin nombre" }
    var ultimoMensaje: Mensaje? { ultimo?.first }
}

struct Mensaje: Codable, Identifiable, Hashable {
    let id: UUID
    let conversationId: UUID?
    let direction: String   // inbound · outbound
    let sender: String      // contact · bot · agent · system
    let body: String?
    let payload: Payload?
    let createdAt: Date?

    struct Payload: Codable, Hashable {
        struct Boton: Codable, Hashable { let id: String?; let label: String? }
        struct NoEntregado: Codable, Hashable { let motivo: String? }
        struct Adjunto: Codable, Hashable { let url: String?; let tipo: String?; let nombre: String? }
        let buttons: [Boton]?
        let noEntregado: NoEntregado?
        let adjunto: Adjunto?
    }

    var esDelCliente: Bool { direction == "inbound" }
    var esDelBot: Bool { sender == "bot" }
    var esDeAgente: Bool { sender == "agent" }
    var esDelSistema: Bool { sender == "system" }
    var texto: String { (body ?? "").trimmingCharacters(in: .whitespacesAndNewlines) }
}

struct NotaDeContacto: Codable, Identifiable, Hashable {
    let id: UUID
    let body: String?
    let authorName: String?
    let color: String?
    let createdAt: Date?
}

struct Tienda: Codable, Identifiable, Hashable {
    let id: UUID
    let slug: String
    let nombre: String?
    let activa: Bool?
    let config: Config?

    struct Config: Codable, Hashable {
        let moneda: String?
        let titulo: String?
    }
    var moneda: String { config?.moneda ?? "$" }
}

struct Pedido: Codable, Identifiable, Hashable {
    let id: UUID
    let tiendaId: UUID
    let numero: Int?
    var estado: String       // recibido · confirmado · preparando · en_camino · entregado · cancelado
    let canal: String?
    let total: Int?          // centavos
    var pago: String?        // sin_cobro · pagado · expirado · pendiente …
    let codigo: String?
    let contactoId: UUID?
    let conversacionId: UUID?
    let entregaDireccion: String?
    let entregaNota: String?
    let respuestas: [Respuesta]?
    let createdAt: Date?
    let updatedAt: Date?
    var lineas: [Linea]?

    struct Respuesta: Codable, Hashable {
        let id: String?
        let etiqueta: String?
        let valor: String?
    }

    struct Linea: Codable, Identifiable, Hashable {
        let id: UUID
        let nombre: String?
        let precio: Int?
        let cantidad: Int?
        let nota: String?
    }

    var pagado: Bool { pago == "pagado" }
    var nombreCliente: String {
        respuestas?.first(where: { ($0.id ?? "").contains("nombre") })?.valor ?? "Cliente"
    }
    var telefonoCliente: String? {
        respuestas?.first(where: { ($0.id ?? "").contains("telefono") })?.valor
    }
    var direccion: String? {
        entregaDireccion ?? respuestas?.first(where: { ($0.id ?? "").contains("direccion") })?.valor
    }

    static let ordenDeEstados = ["recibido", "confirmado", "preparando", "en_camino", "entregado", "cancelado"]

    static func etiqueta(_ estado: String) -> String {
        switch estado {
        case "recibido": return "Nuevo"
        case "confirmado": return "Confirmado"
        case "preparando": return "Preparando"
        case "en_camino": return "En camino"
        case "entregado": return "Entregado"
        case "cancelado": return "Cancelado"
        default: return estado.capitalized
        }
    }

    /// El siguiente paso natural y el texto del botón, en palabras de todos los días.
    var siguientePaso: (estado: String, titulo: String)? {
        switch estado {
        case "recibido": return ("confirmado", "Confirmar pedido")
        case "confirmado": return ("preparando", "Ya lo estoy preparando")
        case "preparando": return ("en_camino", "Ya salió")
        case "en_camino": return ("entregado", "Ya lo entregué")
        default: return nil
        }
    }
    var sePuedeCancelar: Bool { estado != "entregado" && estado != "cancelado" }
}

struct Cita: Codable, Identifiable, Hashable {
    let id: UUID
    let contactId: UUID?
    let conversationId: UUID?
    let proveedor: String?
    let titulo: String?
    let nombre: String?
    let correo: String?
    let estado: String?      // agendada · cancelada · …
    let inicio: Date?
    let fin: Date?
    let enlace: String?
    let enlaceCancelar: String?
    let recordatorioEnviadoAt: Date?
    let respuesta: String?

    var confirmada: Bool { (respuesta ?? "").lowercased().hasPrefix("s") || (respuesta ?? "").lowercased() == "confirmada" }
    var cancelada: Bool { estado == "cancelada" }
    var duracionMin: Int {
        guard let inicio, let fin else { return 30 }
        return max(5, Int(fin.timeIntervalSince(inicio) / 60))
    }
}

/// Los números de la pantalla de inicio.
struct Resumen: Hashable {
    var conversacionesSemana = 0
    var conversacionesSemanaAnterior = 0
    var porcentajeBot = 0
    var citasAgendadas = 0
    var leadsNuevos = 0
    var esperanPersona = 0
    var pedidosNuevos = 0
    var pedidosHoy = 0
    var vendidoHoy = 0        // centavos
    var mensajesMes = 0
    var chatbotsActivos = 0
}

/// Etiquetas de estado que se ven por toda la app.
enum Canal {
    static func nombre(_ c: String?) -> String {
        switch c {
        case "whatsapp": return "WhatsApp"
        case "instagram": return "Instagram"
        case "messenger": return "Messenger"
        case "telegram": return "Telegram"
        case "webchat": return "Sitio web"
        case "tienda": return "Tienda"
        default: return c?.capitalized ?? ""
        }
    }
    static func color(_ c: String?) -> Color {
        switch c {
        case "whatsapp": return Theme.verde
        case "instagram": return Theme.rosa
        case "messenger": return Theme.azul
        default: return Theme.violeta
        }
    }
}
