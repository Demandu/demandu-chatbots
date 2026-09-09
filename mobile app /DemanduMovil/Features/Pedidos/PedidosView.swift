import SwiftUI
import Supabase

/// Pedidos de la tienda: cada tarjeta es un pedido y el botón rosado lo mueve al siguiente paso.
struct PedidosView: View {
    @Environment(Sesion.self) private var sesion
    @State private var filtro = "recibido"
    @State private var pedidos: [Pedido] = []
    @State private var cargando = true
    @State private var error: String?
    @State private var avisoOk: String?
    var enPila: Bool = false

    private var filtrados: [Pedido] {
        switch filtro {
        case "todos": return pedidos
        case "activos": return pedidos.filter { !["entregado", "cancelado"].contains($0.estado) }
        default: return pedidos.filter { $0.estado == filtro }
        }
    }

    private func cuantos(_ estado: String) -> Int { pedidos.filter { $0.estado == estado }.count }

    private var vendidoHoy: Int {
        let hoy = Calendar.current.startOfDay(for: Date())
        return pedidos.filter { $0.pagado && ($0.createdAt ?? .distantPast) >= hoy }.reduce(0) { $0 + ($1.total ?? 0) }
    }
    private var pedidosHoy: Int {
        let hoy = Calendar.current.startOfDay(for: Date())
        return pedidos.filter { ($0.createdAt ?? .distantPast) >= hoy }.count
    }

    var body: some View {
        Pantalla {
            ScrollView {
                VStack(spacing: 12) {
                    Encabezado(titulo: "Pedidos",
                               subtitulo: pedidosHoy == 0 ? "Sin pedidos hoy todavía" : "\(pedidosHoy) pedido\(pedidosHoy == 1 ? "" : "s") hoy",
                               avisos: cuantos("recibido"),
                               atras: enPila)

                    if sesion.tienda == nil {
                        VStack(spacing: 14) {
                            Vacio(icono: "storefront", titulo: "Todavía no tienes tienda",
                                  detalle: "Créala desde la computadora y aquí verás los pedidos que lleguen.")
                            Link("Abrir la plataforma", destination: Backend.plataforma.appendingPathComponent("tienda"))
                                .buttonStyle(BotonSecundarioStyle())
                        }
                        .padding(.horizontal, 18)
                    } else {
                        HStack(spacing: 12) {
                            Cifra(valor: Dinero.texto(vendidoHoy, moneda: sesion.tienda?.moneda ?? "$"), etiqueta: "Vendido hoy")
                            Cifra(valor: pedidosHoy == 0 ? "—" : Dinero.texto(vendidoHoy / max(pedidosHoy, 1), moneda: sesion.tienda?.moneda ?? "$"), etiqueta: "Cada pedido, en promedio")
                        }
                        .padding(.horizontal, 18)

                        Text("Cada tarjeta es un pedido. Toca el botón rosado cuando lo hayas hecho y el cliente recibe el aviso solo.")
                            .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18)

                        Filtros(opciones: [
                            Opcion(valor: "recibido", titulo: "Nuevos · \(cuantos("recibido"))"),
                            Opcion(valor: "confirmado", titulo: "Confirmados · \(cuantos("confirmado"))"),
                            Opcion(valor: "preparando", titulo: "Preparando · \(cuantos("preparando"))"),
                            Opcion(valor: "en_camino", titulo: "En camino · \(cuantos("en_camino"))"),
                            Opcion(valor: "entregado", titulo: "Entregados"),
                            Opcion(valor: "cancelado", titulo: "Cancelados"),
                            Opcion(valor: "todos", titulo: "Todos"),
                        ], elegido: $filtro)

                        if let error { Aviso(texto: error).padding(.horizontal, 18) }
                        if let avisoOk { Aviso(texto: avisoOk, color: Theme.verde).padding(.horizontal, 18) }

                        if cargando && pedidos.isEmpty {
                            ProgressView().tint(.white).padding(.top, 30)
                        } else if filtrados.isEmpty {
                            Vacio(icono: "bag", titulo: "Nada por aquí",
                                  detalle: filtro == "recibido" ? "Cuando entre un pedido nuevo, aparece aquí para que lo confirmes." : "No hay pedidos en este paso.")
                        }

                        LazyVStack(spacing: 12) {
                            ForEach(filtrados) { p in
                                TarjetaPedido(pedido: p, moneda: sesion.tienda?.moneda ?? "$") { estado in
                                    await mover(p, a: estado)
                                }
                            }
                        }
                        .padding(.horizontal, 18)
                    }
                }
                .padding(.bottom, 24)
            }
            .refreshable { await cargar() }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task { await cargar() }
    }

    func cargar() async {
        guard let orgId = sesion.orgId else { cargando = false; return }
        do {
            let lista: [Pedido] = try await Backend.client
                .from("pedidos")
                .select("id, tienda_id, numero, estado, canal, total, pago, codigo, contacto_id, conversacion_id, entrega_direccion, entrega_nota, respuestas, created_at, updated_at, lineas:pedido_lineas(id, nombre, precio, cantidad, nota)")
                .eq("org_id", value: orgId.uuidString)
                .order("created_at", ascending: false)
                .limit(150)
                .execute()
                .value
            pedidos = lista
            error = nil
        } catch {
            self.error = "No pude cargar los pedidos: \(error.localizedDescription)"
        }
        cargando = false
    }

    /// El cambio de estado lo hace la web (misma lógica del panel: valida el cobro,
    /// apunta el evento y le avisa al cliente por WhatsApp).
    private func mover(_ p: Pedido, a estado: String) async {
        error = nil
        avisoOk = nil
        do {
            let token = try await sesion.token()
            let api = PlataformaAPI(token: token)
            let mensaje = try await api.moverPedido(tienda: p.tiendaId, pedido: p.id, estado: estado)
            if !mensaje.isEmpty { avisoOk = mensaje }
            await cargar()
            await sesion.refrescarResumen()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

/// La tarjeta de un pedido con sus líneas y los botones de acción.
struct TarjetaPedido: View {
    let pedido: Pedido
    let moneda: String
    let accion: (String) async -> Void

    @State private var ocupado = false
    @State private var confirmarCancelar = false
    @State private var confirmarCobrado = false

    private var colorPago: Color {
        switch pedido.pago ?? "" {
        case "pagado": return Theme.verde
        case "expirado": return Theme.rojo
        default: return Theme.ambar
        }
    }
    private var textoPago: String {
        switch pedido.pago ?? "" {
        case "pagado": return "Pagado"
        case "expirado": return "Pago vencido"
        case "sin_cobro": return "Sin cobro"
        case "pendiente": return "Pagando ahora"
        default: return pedido.pago?.capitalized ?? "Sin cobro"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text("#\(pedido.numero ?? 0)").font(Theme.cuerpo(12, peso: .semibold)).foregroundStyle(Theme.textoSuave)
                        Pildora(texto: Pedido.etiqueta(pedido.estado), color: pedido.estado == "cancelado" ? Theme.textoSuave : Theme.violeta)
                    }
                    Text(pedido.nombreCliente).font(Theme.cuerpo(15, peso: .semibold)).foregroundStyle(Theme.texto)
                    Text("\(Canal.nombre(pedido.canal)) · \(Fechas.hace(pedido.createdAt))")
                        .font(Theme.cuerpo(12)).foregroundStyle(Theme.textoSuave)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text(Dinero.texto(pedido.total ?? 0, moneda: moneda)).font(Theme.titulo(17)).foregroundStyle(Theme.texto)
                    Pildora(texto: textoPago, color: colorPago)
                }
            }

            Rectangle().fill(Theme.borde).frame(height: 0.5)

            VStack(alignment: .leading, spacing: 5) {
                ForEach(pedido.lineas ?? []) { l in
                    HStack(alignment: .top) {
                        Text("\(l.cantidad ?? 1) × \(l.nombre ?? "Producto")")
                            .font(Theme.cuerpo(13.5)).foregroundStyle(Theme.textoTarjeta)
                        Spacer()
                        Text(Dinero.texto((l.precio ?? 0) * (l.cantidad ?? 1), moneda: moneda))
                            .font(Theme.cuerpo(13)).foregroundStyle(Theme.textoSuave)
                    }
                    if let nota = l.nota, !nota.isEmpty {
                        Text("Nota: \(nota)").font(Theme.cuerpo(12)).foregroundStyle(Theme.textoSuave)
                    }
                }
            }

            if let dir = pedido.direccion, !dir.isEmpty {
                Label(dir, systemImage: "mappin.and.ellipse")
                    .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
                    .lineLimit(3)
            }
            if let nota = pedido.entregaNota, !nota.isEmpty {
                Text("Indicaciones: \(nota)").font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
            }

            if ocupado {
                HStack { Spacer(); ProgressView().tint(.white); Spacer() }.padding(.top, 4)
            } else {
                VStack(spacing: 8) {
                    if let paso = pedido.siguientePaso {
                        if pedido.pagado || paso.estado == "cancelado" {
                            Button(paso.titulo) { Task { await ejecutar(paso.estado) } }
                                .buttonStyle(BotonPrincipalStyle())
                        } else {
                            Text("Falta el pago para poder avanzar. Si ya te pagó por otra vía, márcalo.")
                                .font(Theme.cuerpo(12)).foregroundStyle(Theme.ambar)
                            Button("Ya me pagó por otra vía") { confirmarCobrado = true }
                                .buttonStyle(BotonPrincipalStyle())
                        }
                    }
                    HStack(spacing: 8) {
                        if let convId = pedido.conversacionId {
                            NavigationLink {
                                ChatDesdePedido(conversacionId: convId)
                            } label: {
                                Text("Chat").frame(maxWidth: .infinity)
                            }
                            .buttonStyle(BotonSecundarioStyle())
                        } else if let tel = pedido.telefonoCliente, let url = URL(string: "https://wa.me/\(tel.filter { $0.isNumber })") {
                            Link(destination: url) { Text("WhatsApp").frame(maxWidth: .infinity) }
                                .buttonStyle(BotonSecundarioStyle())
                        }
                        if pedido.sePuedeCancelar {
                            Button("Cancelar") { confirmarCancelar = true }
                                .buttonStyle(BotonSecundarioStyle())
                        }
                    }
                }
            }
        }
        .tarjeta()
        .confirmationDialog("¿Cancelar el pedido #\(pedido.numero ?? 0)?", isPresented: $confirmarCancelar, titleVisibility: .visible) {
            Button("Sí, cancelarlo", role: .destructive) { Task { await ejecutar("cancelado") } }
            Button("No, dejarlo", role: .cancel) {}
        } message: {
            Text("El cliente recibe el aviso por WhatsApp. Esto no se puede deshacer.")
        }
        .confirmationDialog("¿Marcar como cobrado?", isPresented: $confirmarCobrado, titleVisibility: .visible) {
            Button("Sí, ya me pagó") { Task { await ejecutar("cobrado_por_fuera") } }
            Button("Todavía no", role: .cancel) {}
        } message: {
            Text("Queda apuntado que el pago no entró por Yappy.")
        }
    }

    private func ejecutar(_ estado: String) async {
        ocupado = true
        await accion(estado)
        ocupado = false
    }
}

/// Abre la conversación de un pedido cargándola por su id.
struct ChatDesdePedido: View {
    let conversacionId: UUID
    @State private var conv: Conversacion?
    @State private var error: String?

    var body: some View {
        Group {
            if let conv {
                ChatDetalleView(conversacion: conv)
            } else if let error {
                ZStack { Theme.fondoConLuz; Aviso(texto: error).padding() }
            } else {
                ZStack { Theme.fondoConLuz; ProgressView().tint(.white) }
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .task {
            do {
                let c: Conversacion = try await Backend.client.from("conversations")
                    .select("id, org_id, contact_id, bot_id, channel, status, unread, handoff_requested_at, handoff_reason, last_message_at, created_at, contact:contacts(id, name, phone, wa_name)")
                    .eq("id", value: conversacionId.uuidString)
                    .single().execute().value
                conv = c
            } catch {
                self.error = "No encontré esa conversación."
            }
        }
    }
}
