import Foundation
import Supabase

/// Un solo cliente de Supabase para toda la app.
/// Es el mismo proyecto que usa la plataforma web ("Demandu Chatbot").
enum Backend {
    static let supabaseURL = URL(string: "https://stgedtcsuyypzjbxcpoe.supabase.co")!
    static let supabaseKey = "sb_publishable_sHAF6lEBKMLB9uxIFBLV2g_dc6FT11y"

    /// La web de la plataforma: ahí viven las rutas que mandan mensajes de verdad
    /// por WhatsApp/Instagram y las que mueven pedidos avisando al cliente.
    static let plataforma = URL(string: "https://platform.demandu.tech")!

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let c = try decoder.singleValueContainer()
            let s = try c.decode(String.self)
            if let f = Fechas.parsear(s) { return f }
            throw DecodingError.dataCorruptedError(in: c, debugDescription: "Fecha no reconocida: \(s)")
        }
        return d
    }()

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    static let client = SupabaseClient(
        supabaseURL: supabaseURL,
        supabaseKey: supabaseKey,
        options: SupabaseClientOptions(
            db: .init(schema: "public", encoder: encoder, decoder: decoder)
        )
    )
}

/// Postgres devuelve fechas como "2026-09-09T03:01:35.819315+00:00" (con 6 decimales)
/// o "2026-09-09T15:00:00+00:00" (sin decimales). Aquí se aceptan las dos.
enum Fechas {
    private static let conFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private static let sinFraccion: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()
    private static let soloDia: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        return f
    }()

    static func parsear(_ original: String) -> Date? {
        var s = original
        // Sin zona horaria → se asume UTC (así lo guarda Postgres).
        if !s.contains("+") && !s.hasSuffix("Z") && !s.contains("-", after: 10) {
            s += "Z"
        }
        // Recorta los decimales a 3: ISO8601DateFormatter solo entiende milisegundos.
        if let punto = s.firstIndex(of: "."),
           let finFraccion = s[punto...].firstIndex(where: { $0 == "+" || $0 == "-" || $0 == "Z" }) {
            let fraccion = s[s.index(after: punto)..<finFraccion]
            let recortada = String(fraccion.prefix(3)).padding(toLength: 3, withPad: "0", startingAt: 0)
            s.replaceSubrange(punto..<finFraccion, with: "." + recortada)
        }
        return conFraccion.date(from: s) ?? sinFraccion.date(from: s) ?? soloDia.date(from: original)
    }

    static let hora: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "HH:mm"
        return f
    }()

    static let diaCorto: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "EEE d MMM"
        return f
    }()

    static let diaLargo: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "EEEE d 'de' MMMM"
        return f
    }()

    /// "09:41" si fue hoy, "Ayer" si fue ayer, o "mar 8 sep".
    static func relativa(_ d: Date?) -> String {
        guard let d else { return "" }
        let cal = Calendar.current
        if cal.isDateInToday(d) { return hora.string(from: d) }
        if cal.isDateInYesterday(d) { return "Ayer" }
        return diaCorto.string(from: d)
    }

    /// "hace 3 min", "hace 2 h", "hace 3 días".
    static func hace(_ d: Date?) -> String {
        guard let d else { return "" }
        let seg = Int(Date().timeIntervalSince(d))
        if seg < 60 { return "ahora" }
        if seg < 3600 { return "hace \(seg / 60) min" }
        if seg < 86400 { return "hace \(seg / 3600) h" }
        let dias = seg / 86400
        return dias == 1 ? "hace 1 día" : "hace \(dias) días"
    }

    static func iso(_ d: Date) -> String { sinFraccion.string(from: d) }
}

private extension String {
    func contains(_ ch: Character, after: Int) -> Bool {
        guard count > after else { return false }
        return self[index(startIndex, offsetBy: after)...].contains(ch)
    }
}

/// Dinero: en la base todo va en centavos enteros (`pedidos.total`, `pedido_lineas.precio`).
enum Dinero {
    static func texto(_ centavos: Int, moneda: String = "$") -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        f.locale = Locale(identifier: "es_MX")
        let valor = Double(centavos) / 100
        return moneda + (f.string(from: NSNumber(value: valor)) ?? String(format: "%.2f", valor))
    }
}
