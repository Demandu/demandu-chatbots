import SwiftUI
import Supabase

/// La bandeja: todas las conversaciones del negocio, con filtros.
struct ChatsView: View {
    enum Filtro: Hashable { case todas, esperan, bot, sinLeer }

    @Environment(Sesion.self) private var sesion
    @State private var filtro: Filtro
    @State private var conversaciones: [Conversacion] = []
    @State private var cargando = true
    @State private var error: String?
    @State private var busqueda = ""
    let enPila: Bool

    init(filtroInicial: Filtro = .todas, enPila: Bool = false) {
        _filtro = State(initialValue: filtroInicial)
        self.enPila = enPila
    }

    private var filtradas: [Conversacion] {
        var lista = conversaciones
        switch filtro {
        case .todas: break
        case .esperan: lista = lista.filter { $0.esperaPersona }
        case .bot: lista = lista.filter { !$0.laLlevaUnaPersona && !$0.cerrada }
        case .sinLeer: lista = lista.filter { ($0.unread ?? 0) > 0 }
        }
        let q = busqueda.trimmingCharacters(in: .whitespaces).lowercased()
        if !q.isEmpty {
            lista = lista.filter {
                $0.nombre.lowercased().contains(q) || ($0.contact?.phone ?? "").contains(q)
            }
        }
        return lista
    }

    private var esperando: Int { conversaciones.filter { $0.esperaPersona }.count }

    var body: some View {
        Pantalla {
            VStack(spacing: 0) {
                Encabezado(
                    titulo: "Conversaciones",
                    subtitulo: esperando == 0 ? "Nadie espera respuesta ahora" : "\(esperando) persona\(esperando == 1 ? "" : "s") esperando respuesta",
                    avisos: esperando,
                    atras: enPila
                )

                Filtros(opciones: [
                    Opcion(valor: Filtro.todas, titulo: "Todas"),
                    Opcion(valor: .esperan, titulo: "Esperan persona"),
                    Opcion(valor: .bot, titulo: "Bot"),
                    Opcion(valor: .sinLeer, titulo: "Sin leer"),
                ], elegido: $filtro)
                .padding(.bottom, 10)

                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(Theme.textoSuave)
                    TextField("", text: $busqueda, prompt: Text("Buscar por nombre o teléfono").foregroundStyle(Theme.textoSuave.opacity(0.7)))
                        .font(Theme.cuerpo(14)).foregroundStyle(Theme.texto)
                        .autocorrectionDisabled()
                    if !busqueda.isEmpty {
                        Button { busqueda = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.textoSuave) }
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
                .padding(.horizontal, 18)
                .padding(.bottom, 8)

                if let error { Aviso(texto: error).padding(.horizontal, 18) }

                List {
                    if cargando && conversaciones.isEmpty {
                        HStack { Spacer(); ProgressView().tint(.white); Spacer() }
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    } else if filtradas.isEmpty {
                        Vacio(icono: "bubble.left.and.bubble.right",
                              titulo: filtro == .esperan ? "Nadie espera una persona" : "Sin conversaciones",
                              detalle: filtro == .esperan ? "Cuando un cliente pida hablar con alguien del equipo, aparece aquí." : "Cuando alguien escriba a tus chatbots, lo verás aquí.")
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                    }
                    ForEach(filtradas) { c in
                        NavigationLink {
                            ChatDetalleView(conversacion: c)
                        } label: {
                            FilaConversacion(conv: c)
                        }
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                        .listRowInsets(EdgeInsets(top: 5, leading: 18, bottom: 5, trailing: 18))
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .refreshable { await cargar() }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await cargar() }
    }

    func cargar() async {
        guard let orgId = sesion.orgId else { return }
        let columnas = "id, org_id, contact_id, bot_id, channel, status, unread, handoff_requested_at, handoff_reason, last_message_at, created_at, contact:contacts(id, name, phone, wa_name)"
        do {
            // Con el último mensaje de cada conversación (ordenado y limitado a 1).
            let lista: [Conversacion] = try await Backend.client
                .from("conversations")
                .select(columnas + ", ultimo:messages(id, conversation_id, direction, sender, body, payload, created_at)")
                .eq("org_id", value: orgId.uuidString)
                .order("last_message_at", ascending: false, nullsFirst: false)
                .order("created_at", ascending: false, nullsFirst: false, referencedTable: "ultimo")
                .limit(1, referencedTable: "ultimo")
                .limit(200)
                .execute()
                .value
            conversaciones = lista
            error = nil
        } catch {
            // Si la base no acepta el orden por alias, se cargan sin el último mensaje.
            do {
                let lista: [Conversacion] = try await Backend.client
                    .from("conversations")
                    .select(columnas)
                    .eq("org_id", value: orgId.uuidString)
                    .order("last_message_at", ascending: false, nullsFirst: false)
                    .limit(200)
                    .execute()
                    .value
                conversaciones = lista
                self.error = nil
            } catch {
                self.error = "No pude cargar las conversaciones: \(error.localizedDescription)"
            }
        }
        cargando = false
    }
}

/// Una fila de la bandeja.
struct FilaConversacion: View {
    let conv: Conversacion

    private var etiqueta: (String, Color)? {
        if conv.esperaPersona { return ("Espera persona", Theme.rosa) }
        if conv.laLlevaUnaPersona { return ("La lleva tu equipo", Theme.azul) }
        if conv.cerrada { return ("Cerrada", Theme.textoSuave) }
        if let u = conv.ultimoMensaje, u.esDelBot { return ("Contestó el bot", Theme.verde) }
        return nil
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                Avatar(iniciales: conv.contact?.iniciales ?? "?")
                Circle()
                    .fill(Canal.color(conv.channel))
                    .frame(width: 12, height: 12)
                    .overlay(Circle().stroke(Theme.tarjeta, lineWidth: 2))
                    .offset(x: 3, y: 3)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline) {
                    Text(conv.nombre)
                        .font(Theme.cuerpo(15, peso: .semibold))
                        .foregroundStyle(Theme.texto)
                        .lineLimit(1)
                    Spacer()
                    Text(Fechas.relativa(conv.lastMessageAt ?? conv.createdAt))
                        .font(Theme.cuerpo(11.5))
                        .foregroundStyle(Theme.textoSuave)
                }
                Text(previo)
                    .font(Theme.cuerpo(13))
                    .foregroundStyle(Theme.textoTarjeta)
                    .lineLimit(2)
                HStack(spacing: 8) {
                    if let etiqueta { Pildora(texto: etiqueta.0, color: etiqueta.1) }
                    if (conv.unread ?? 0) > 0 {
                        Text("\(conv.unread ?? 0)")
                            .font(Theme.cuerpo(11, peso: .bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Theme.rosa, in: Capsule())
                    }
                }
            }
        }
        .padding(12)
        .background(Theme.tarjeta, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(conv.esperaPersona ? Theme.rosa.opacity(0.45) : Theme.borde, lineWidth: 1))
    }

    private var previo: String {
        if conv.esperaPersona, let motivo = conv.handoffReason, !motivo.isEmpty { return motivo }
        guard let u = conv.ultimoMensaje else { return "Sin mensajes todavía" }
        let quien = u.esDelBot ? "Lana: " : (u.esDeAgente ? "Tú: " : "")
        return quien + (u.texto.isEmpty ? "📎 Adjunto" : u.texto)
    }
}
