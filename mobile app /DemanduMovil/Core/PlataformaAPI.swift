import Foundation

/// Llamadas a la web de la plataforma (platform.demandu.tech).
///
/// ¿Por qué no escribir directo en Supabase? Porque mandar un mensaje por WhatsApp
/// o mover un pedido no es solo guardar una fila: hay que hablar con Meta, avisar
/// al cliente, recalcular… Todo eso ya está escrito y probado en la web. La app
/// llama a esas mismas rutas con el token de la sesión (Authorization: Bearer).
struct PlataformaAPI {
    let token: String

    struct ErrorDeAPI: LocalizedError {
        let mensaje: String
        var errorDescription: String? { mensaje }
    }

    private func post(_ ruta: String, _ cuerpo: [String: Any]) async throws -> [String: Any] {
        var req = URLRequest(url: Backend.plataforma.appendingPathComponent(ruta))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONSerialization.data(withJSONObject: cuerpo)
        req.timeoutInterval = 30

        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 {
            throw ErrorDeAPI(mensaje: "La sesión caducó. Sal y vuelve a entrar.")
        }
        if status == 404 && json.isEmpty {
            throw ErrorDeAPI(mensaje: "La web todavía no tiene esta función publicada (\(ruta)).")
        }
        if !(200..<300).contains(status) {
            let m = (json["error"] as? String) ?? (json["mensaje"] as? String) ?? "Algo salió mal (\(status))."
            throw ErrorDeAPI(mensaje: m)
        }
        return json
    }

    /// Manda lo que escribe la persona al cliente, por el canal que sea.
    /// Ruta existente de la web: /api/canales/enviar
    func enviarMensaje(conversacion: UUID, texto: String) async throws {
        _ = try await post("api/canales/enviar", [
            "conversacion": conversacion.uuidString.lowercased(),
            "texto": texto,
        ])
    }

    /// Mueve un pedido de estado (y la web le avisa al cliente por WhatsApp).
    /// Ruta nueva de la web: /api/movil/pedido — usa la misma lógica del panel.
    /// Devuelve el mensaje que la web quiere enseñar, si hay uno.
    func moverPedido(tienda: UUID, pedido: UUID, estado: String) async throws -> String {
        let r = try await post("api/movil/pedido", [
            "tienda_id": tienda.uuidString.lowercased(),
            "pedido_id": pedido.uuidString.lowercased(),
            "estado": estado,
        ])
        if let ok = r["ok"] as? Bool, !ok {
            throw ErrorDeAPI(mensaje: (r["mensaje"] as? String) ?? "No se pudo mover el pedido.")
        }
        return (r["mensaje"] as? String) ?? ""
    }
}
