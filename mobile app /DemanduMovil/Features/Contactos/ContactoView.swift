import SwiftUI
import Supabase

/// La ficha del cliente: datos, cuánto ha comprado, notas del equipo.
struct ContactoView: View {
    @Environment(Sesion.self) private var sesion
    let contactId: UUID

    @State private var contacto: Contacto?
    @State private var pedidos: [Pedido] = []
    @State private var citas: [Cita] = []
    @State private var notas: [NotaDeContacto] = []
    @State private var conversacion: Conversacion?
    @State private var error: String?
    @State private var nuevaNota = ""
    @State private var guardandoNota = false

    private var comprado: Int { pedidos.filter { $0.pagado }.reduce(0) { $0 + ($1.total ?? 0) } }
    private var compras: Int { pedidos.filter { $0.pagado }.count }
    private var cancelados: Int { pedidos.filter { $0.estado == "cancelado" }.count }

    /// Lo que más pide: cuenta las líneas por nombre de producto.
    struct Favorito: Identifiable { let id: String; let veces: Int }
    private var favoritos: [Favorito] {
        var conteo: [String: Int] = [:]
        for p in pedidos where p.estado != "cancelado" {
            for l in p.lineas ?? [] { conteo[l.nombre ?? "Producto", default: 0] += l.cantidad ?? 1 }
        }
        return conteo.sorted { $0.value > $1.value }.prefix(4).map { Favorito(id: $0.key, veces: $0.value) }
    }

    var body: some View {
        Pantalla {
            ScrollView {
                VStack(spacing: 12) {
                    Encabezado(titulo: "Ficha del cliente", subtitulo: contacto?.nombreVisible ?? "", avisos: 0, atras: true)

                    if let error { Aviso(texto: error).padding(.horizontal, 18) }

                    if let c = contacto {
                        VStack(spacing: 12) {
                            HStack(spacing: 14) {
                                Avatar(iniciales: c.iniciales, tamano: 56)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(c.nombreVisible).font(Theme.titulo(18)).foregroundStyle(Theme.texto)
                                    Text("\(Canal.nombre(c.channel)) · \(c.phone ?? c.email ?? "")")
                                        .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
                                    if let tags = c.tags, !tags.isEmpty {
                                        ScrollView(.horizontal, showsIndicators: false) {
                                            HStack(spacing: 6) { ForEach(tags, id: \.self) { Pildora(texto: $0, color: Theme.violeta) } }
                                        }
                                    }
                                }
                                Spacer()
                            }
                            .tarjeta()

                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                Cifra(valor: "\(compras)", etiqueta: "Compras")
                                Cifra(valor: Dinero.texto(comprado, moneda: sesion.tienda?.moneda ?? "$"), etiqueta: "Ha gastado")
                                Cifra(valor: compras == 0 ? "—" : Dinero.texto(comprado / max(compras, 1), moneda: sesion.tienda?.moneda ?? "$"), etiqueta: "Cada compra")
                                Cifra(valor: "\(cancelados)", etiqueta: "Canceló")
                            }

                            if !favoritos.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Lo que más se lleva").font(Theme.titulo(15, peso: .bold)).foregroundStyle(Theme.texto)
                                    ForEach(favoritos) { f in
                                        let nombre = f.id
                                        let veces = f.veces
                                        HStack {
                                            Text(nombre).font(Theme.cuerpo(13.5)).foregroundStyle(Theme.textoTarjeta)
                                            Spacer()
                                            Text("\(veces) \(veces == 1 ? "vez" : "veces")").font(Theme.cuerpo(13, peso: .semibold)).foregroundStyle(Theme.texto)
                                        }
                                    }
                                }
                                .tarjeta()
                            }

                            if !citas.isEmpty {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text("Sus citas").font(Theme.titulo(15, peso: .bold)).foregroundStyle(Theme.texto)
                                    ForEach(citas.prefix(5)) { ci in
                                        HStack {
                                            Text(ci.inicio.map { Fechas.diaCorto.string(from: $0) + " · " + Fechas.hora.string(from: $0) } ?? "")
                                                .font(Theme.cuerpo(13)).foregroundStyle(Theme.textoTarjeta)
                                            Spacer()
                                            Pildora(texto: ci.cancelada ? "Cancelada" : (ci.confirmada ? "Confirmada" : "Agendada"),
                                                    color: ci.cancelada ? Theme.textoSuave : (ci.confirmada ? Theme.verde : Theme.azul))
                                        }
                                    }
                                }
                                .tarjeta()
                            }

                            // Notas del equipo
                            VStack(alignment: .leading, spacing: 10) {
                                Text("Notas de tu equipo").font(Theme.titulo(15, peso: .bold)).foregroundStyle(Theme.texto)
                                if notas.isEmpty {
                                    Text("Todavía nadie ha escrito una nota sobre este cliente.")
                                        .font(Theme.cuerpo(13)).foregroundStyle(Theme.textoSuave)
                                }
                                ForEach(notas) { n in
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(n.body ?? "").font(Theme.cuerpo(13.5)).foregroundStyle(Theme.texto)
                                        Text("\(n.authorName ?? "Equipo") · \(Fechas.relativa(n.createdAt))")
                                            .font(Theme.cuerpo(11)).foregroundStyle(Theme.textoSuave)
                                    }
                                    .padding(10)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background((Color(hexString: n.color ?? "") ?? Theme.ambar).opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                }
                                HStack(spacing: 8) {
                                    TextField("", text: $nuevaNota, prompt: Text("Escribe una nota…").foregroundStyle(Theme.textoSuave.opacity(0.7)), axis: .vertical)
                                        .font(Theme.cuerpo(14)).foregroundStyle(Theme.texto)
                                        .padding(.horizontal, 12).padding(.vertical, 10)
                                        .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
                                    Button {
                                        Task { await guardarNota() }
                                    } label: {
                                        if guardandoNota { ProgressView().tint(.white) } else { Text("Guardar") }
                                    }
                                    .buttonStyle(BotonPrincipalStyle())
                                    .frame(width: 100)
                                    .disabled(nuevaNota.trimmingCharacters(in: .whitespaces).isEmpty || guardandoNota)
                                }
                            }
                            .tarjeta()

                            if let conversacion {
                                NavigationLink { ChatDetalleView(conversacion: conversacion) } label: {
                                    Text("Abrir su conversación").frame(maxWidth: .infinity)
                                }
                                .buttonStyle(BotonPrincipalStyle())
                            }
                        }
                        .padding(.horizontal, 18)
                    } else if error == nil {
                        ProgressView().tint(.white).padding(.top, 40)
                    }
                }
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await cargar() }
    }

    private func cargar() async {
        let sb = Backend.client
        let id = contactId.uuidString
        do {
            let c: Contacto = try await sb.from("contacts")
                .select("id, name, phone, email, wa_name, channel, tags, company, country, notes, created_at")
                .eq("id", value: id).single().execute().value
            contacto = c

            let ped: [Pedido]? = try? await sb.from("pedidos")
                .select("id, tienda_id, numero, estado, canal, total, pago, codigo, contacto_id, conversacion_id, entrega_direccion, entrega_nota, respuestas, created_at, updated_at, lineas:pedido_lineas(id, nombre, precio, cantidad, nota)")
                .eq("contacto_id", value: id).order("created_at", ascending: false).limit(100).execute().value
            pedidos = ped ?? []

            let cit: [Cita]? = try? await sb.from("citas")
                .select("id, contact_id, conversation_id, proveedor, titulo, nombre, correo, estado, inicio, fin, enlace, enlace_cancelar, recordatorio_enviado_at, respuesta")
                .eq("contact_id", value: id).order("inicio", ascending: false).limit(20).execute().value
            citas = cit ?? []

            notas = await cargarNotas()

            let convs: [Conversacion]? = try? await sb.from("conversations")
                .select("id, org_id, contact_id, bot_id, channel, status, unread, handoff_requested_at, handoff_reason, last_message_at, created_at, contact:contacts(id, name, phone, wa_name)")
                .eq("contact_id", value: id).order("last_message_at", ascending: false, nullsFirst: false).limit(1).execute().value
            conversacion = convs?.first
        } catch {
            self.error = "No pude cargar la ficha: \(error.localizedDescription)"
        }
    }

    private func cargarNotas() async -> [NotaDeContacto] {
        let lista: [NotaDeContacto]? = try? await Backend.client.from("contact_notes")
            .select("id, body, author_name, color, created_at")
            .eq("contact_id", value: contactId.uuidString).order("created_at", ascending: false).execute().value
        return lista ?? []
    }

    private func guardarNota() async {
        guard let orgId = sesion.orgId else { return }
        let cuerpo = nuevaNota.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cuerpo.isEmpty else { return }
        guardandoNota = true
        struct Nueva: Encodable {
            let orgId: String; let contactId: String; let body: String; let authorName: String; let color: String
        }
        do {
            let autor = sesion.organizacion?.contactoNombre ?? sesion.usuarioEmail
            try await Backend.client.from("contact_notes")
                .insert(Nueva(orgId: orgId.uuidString, contactId: contactId.uuidString, body: cuerpo, authorName: autor, color: "#FFC53D"))
                .execute()
            nuevaNota = ""
            notas = await cargarNotas()
        } catch {
            self.error = "No pude guardar la nota: \(error.localizedDescription)"
        }
        guardandoNota = false
    }
}
