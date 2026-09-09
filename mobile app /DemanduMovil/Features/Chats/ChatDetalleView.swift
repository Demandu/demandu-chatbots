import SwiftUI
import Supabase

/// Una conversación: el interruptor de Lana arriba, los mensajes, y la caja para escribir.
struct ChatDetalleView: View {
    @Environment(Sesion.self) private var sesion
    @Environment(\.dismiss) private var dismiss
    @State var conversacion: Conversacion
    @State private var mensajes: [Mensaje] = []
    @State private var texto = ""
    @State private var enviando = false
    @State private var cambiandoIA = false
    @State private var error: String?
    @State private var cargando = true
    @FocusState private var escribiendo: Bool

    private var lanaContesta: Bool { !conversacion.laLlevaUnaPersona }

    var body: some View {
        ZStack {
            Theme.fondoConLuz
            VStack(spacing: 0) {
                cabecera
                interruptorLana
                    .padding(.horizontal, 18)
                    .padding(.bottom, 8)

                if let contactId = conversacion.contactId {
                    NavigationLink {
                        ContactoView(contactId: contactId)
                    } label: {
                        HStack {
                            Text("Ver la ficha de \(conversacion.nombre)")
                                .font(Theme.cuerpo(13, peso: .semibold)).foregroundStyle(Theme.texto)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.textoSuave)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10)
                        .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 18)
                    .padding(.bottom, 8)
                }

                if let error { Aviso(texto: error).padding(.horizontal, 18).padding(.bottom, 6) }

                listaDeMensajes
                cajaDeTexto
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await cargarMensajes(primeraVez: true) }
        .task {
            // Mientras esta pantalla esté abierta, se pregunta cada 4 s si hay algo nuevo.
            // Es lo mismo que hace el widget web y no depende de nada más.
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                await cargarMensajes(primeraVez: false)
            }
        }
        .onAppear { Task { await marcarLeida() } }
    }

    // MARK: Partes

    private var cabecera: some View {
        HStack(spacing: 12) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(Theme.texto)
                    .frame(width: 38, height: 38)
                    .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
            }
            .buttonStyle(.plain)
            VStack(alignment: .leading, spacing: 2) {
                Text(conversacion.nombre).font(Theme.titulo(19)).foregroundStyle(Theme.texto).lineLimit(1)
                HStack(spacing: 6) {
                    Circle().fill(Canal.color(conversacion.channel)).frame(width: 7, height: 7)
                    Text("\(Canal.nombre(conversacion.channel)) · \(conversacion.contact?.phone ?? "")")
                        .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave).lineLimit(1)
                }
            }
            Spacer()
            if let tel = conversacion.contact?.phone, let url = URL(string: "tel:\(tel.filter { $0.isNumber || $0 == "+" })") {
                Link(destination: url) {
                    Image(systemName: "phone.fill")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Theme.texto)
                        .frame(width: 38, height: 38)
                        .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private var interruptorLana: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(lanaContesta ? "Lana está contestando" : "La llevas tú")
                    .font(Theme.cuerpo(14, peso: .semibold)).foregroundStyle(Theme.texto)
                Text(lanaContesta
                     ? "El cliente habla con el bot · tómala tú cuando quieras"
                     : "El bot está callado · vuelve a encender a Lana cuando termines")
                    .font(Theme.cuerpo(12)).foregroundStyle(Theme.textoSuave)
            }
            Spacer()
            if cambiandoIA {
                ProgressView().tint(.white)
            } else {
                Toggle("", isOn: Binding(
                    get: { lanaContesta },
                    set: { nuevo in Task { await cambiarIA(encendida: nuevo) } }
                ))
                .labelsHidden()
                .tint(Theme.rosa)
            }
        }
        .padding(14)
        .background(
            LinearGradient(colors: [Theme.rosa.opacity(lanaContesta ? 0.18 : 0.06), Theme.violeta.opacity(lanaContesta ? 0.22 : 0.08)],
                           startPoint: .leading, endPoint: .trailing),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(lanaContesta ? Theme.rosa.opacity(0.35) : Theme.borde))
    }

    private var listaDeMensajes: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 8) {
                    if conversacion.esperaPersona, let motivo = conversacion.handoffReason {
                        Aviso(texto: "Pidió hablar con una persona: \(motivo)", color: Theme.ambar)
                            .padding(.bottom, 6)
                    }
                    if cargando && mensajes.isEmpty {
                        ProgressView().tint(.white).padding(.top, 30)
                    }
                    ForEach(mensajes) { m in
                        Burbuja(mensaje: m).id(m.id)
                    }
                    Color.clear.frame(height: 1).id("fin")
                }
                .padding(.horizontal, 18)
                .padding(.top, 6)
                .padding(.bottom, 10)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: mensajes.count) { _, _ in
                withAnimation { proxy.scrollTo("fin", anchor: .bottom) }
            }
            .onChange(of: escribiendo) { _, activo in
                if activo {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        withAnimation { proxy.scrollTo("fin", anchor: .bottom) }
                    }
                }
            }
        }
    }

    private var cajaDeTexto: some View {
        HStack(spacing: 10) {
            TextField("", text: $texto, prompt: Text(lanaContesta ? "Escribe (Lana se apaga al enviar)…" : "Escribe tu respuesta…").foregroundStyle(Theme.textoSuave.opacity(0.7)), axis: .vertical)
                .lineLimit(1...5)
                .font(Theme.cuerpo(15))
                .foregroundStyle(Theme.texto)
                .focused($escribiendo)
                .padding(.horizontal, 14).padding(.vertical, 11)
                .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.borde))
            Button {
                Task { await enviar() }
            } label: {
                Group {
                    if enviando { ProgressView().tint(.white) }
                    else { Image(systemName: "arrow.up").font(.system(size: 17, weight: .bold)).foregroundStyle(.white) }
                }
                .frame(width: 44, height: 44)
                .background(Theme.degradado, in: Circle())
            }
            .disabled(enviando || texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .opacity(texto.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.5 : 1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Theme.fondoTab.opacity(0.95))
        .overlay(alignment: .top) { Rectangle().fill(Theme.borde).frame(height: 0.5) }
    }

    // MARK: Datos

    private func cargarMensajes(primeraVez: Bool) async {
        do {
            let lista: [Mensaje] = try await Backend.client
                .from("messages")
                .select("id, conversation_id, direction, sender, body, payload, created_at")
                .eq("conversation_id", value: conversacion.id.uuidString)
                .order("created_at", ascending: true)
                .limit(300)
                .execute()
                .value
            if lista != mensajes { mensajes = lista }

            // También se refresca el estado (por si alguien la tomó desde la computadora).
            if !primeraVez {
                struct Fila: Decodable { let status: String; let handoffRequestedAt: Date?; let handoffReason: String? }
                let f: Fila = try await Backend.client.from("conversations")
                    .select("status, handoff_requested_at, handoff_reason")
                    .eq("id", value: conversacion.id.uuidString)
                    .single().execute().value
                if f.status != conversacion.status {
                    conversacion.status = f.status
                    conversacion.handoffRequestedAt = f.handoffRequestedAt
                    conversacion.handoffReason = f.handoffReason
                }
            }
            if primeraVez { error = nil }
        } catch {
            if primeraVez { self.error = "No pude cargar los mensajes: \(error.localizedDescription)" }
        }
        cargando = false
    }

    private func marcarLeida() async {
        guard (conversacion.unread ?? 0) > 0 else { return }
        _ = try? await Backend.client.from("conversations")
            .update(["unread": 0])
            .eq("id", value: conversacion.id.uuidString)
            .execute()
        conversacion.unread = 0
    }

    /// Encender a Lana = "open" (el bot contesta). Apagarla = "assigned" (la lleva una persona).
    private func cambiarIA(encendida: Bool) async {
        cambiandoIA = true
        error = nil
        let nuevo = encendida ? "open" : "assigned"
        let cambios: [String: AnyJSON] = encendida
            ? ["status": .string("open"), "handoff_requested_at": .null]
            : ["status": .string("assigned"), "handoff_requested_at": .null, "assigned_at": .string(Fechas.iso(Date()))]
        do {
            try await Backend.client.from("conversations")
                .update(cambios)
                .eq("id", value: conversacion.id.uuidString)
                .execute()
            conversacion.status = nuevo
            conversacion.handoffRequestedAt = nil
            await sesion.refrescarResumen()
        } catch {
            self.error = "No pude cambiar quién contesta: \(error.localizedDescription)"
        }
        cambiandoIA = false
    }

    private func enviar() async {
        let cuerpo = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cuerpo.isEmpty, !enviando else { return }
        enviando = true
        error = nil
        do {
            let token = try await sesion.token()
            let api = PlataformaAPI(token: token)
            try await api.enviarMensaje(conversacion: conversacion.id, texto: cuerpo)
            texto = ""
            // La web pone la conversación en manos de la persona al enviar.
            conversacion.status = "assigned"
            conversacion.handoffRequestedAt = nil
            await cargarMensajes(primeraVez: false)
            await sesion.refrescarResumen()
        } catch {
            self.error = error.localizedDescription
        }
        enviando = false
    }
}

/// Una burbuja de mensaje. Cliente a la izquierda; bot y equipo a la derecha.
struct Burbuja: View {
    let mensaje: Mensaje

    private var alineadaDerecha: Bool { !mensaje.esDelCliente }
    private var color: Color {
        if mensaje.esDelCliente { return Theme.tarjeta }
        if mensaje.esDeAgente { return Theme.azul.opacity(0.85) }
        return Theme.violeta.opacity(0.9)
    }

    var body: some View {
        if mensaje.esDelSistema {
            Text(mensaje.texto)
                .font(Theme.cuerpo(11.5)).foregroundStyle(Theme.textoSuave)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
        } else {
            HStack {
                if alineadaDerecha { Spacer(minLength: 50) }
                VStack(alignment: alineadaDerecha ? .trailing : .leading, spacing: 5) {
                    if !mensaje.texto.isEmpty {
                        Text(mensaje.texto)
                            .font(Theme.cuerpo(14.5))
                            .foregroundStyle(Theme.texto)
                            .textSelection(.enabled)
                    }
                    if let adj = mensaje.payload?.adjunto, let nombre = adj.nombre ?? adj.url {
                        Label(nombre, systemImage: "paperclip")
                            .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.texto.opacity(0.9)).lineLimit(1)
                    }
                    if let botones = mensaje.payload?.buttons, !botones.isEmpty {
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(Array(botones.enumerated()), id: \.offset) { _, b in
                                Text(b.label ?? "")
                                    .font(Theme.cuerpo(12, peso: .semibold))
                                    .foregroundStyle(Theme.texto)
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(Color.white.opacity(0.14), in: Capsule())
                            }
                        }
                    }
                    HStack(spacing: 5) {
                        if let f = mensaje.payload?.noEntregado {
                            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 10)).foregroundStyle(Theme.ambar)
                            Text(f.motivo ?? "No se entregó").font(Theme.cuerpo(10.5)).foregroundStyle(Theme.ambar).lineLimit(2)
                        }
                        Text((mensaje.esDelBot ? "Lana · " : (mensaje.esDeAgente ? "Tú · " : "")) + Fechas.relativa(mensaje.createdAt))
                            .font(Theme.cuerpo(10.5)).foregroundStyle(Theme.texto.opacity(0.6))
                    }
                }
                .padding(.horizontal, 13).padding(.vertical, 9)
                .background(color, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(mensaje.esDelCliente ? Theme.borde : .clear))
                if !alineadaDerecha { Spacer(minLength: 50) }
            }
        }
    }
}
