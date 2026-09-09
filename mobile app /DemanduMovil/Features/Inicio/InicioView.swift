import SwiftUI

/// Inicio: saludo de Lana, lo urgente, los números de la semana y accesos rápidos.
struct InicioView: View {
    @Environment(Sesion.self) private var sesion

    private var nombre: String {
        let n = sesion.organizacion?.contactoNombre ?? ""
        return n.split(separator: " ").first.map(String.init) ?? "hola"
    }

    var body: some View {
        Group {
            Pantalla {
                ScrollView {
                    VStack(spacing: 14) {
                        Encabezado(
                            titulo: "Inicio",
                            subtitulo: "\(sesion.organizacion?.name ?? "") · \(sesion.resumen.chatbotsActivos) chatbot\(sesion.resumen.chatbotsActivos == 1 ? "" : "s") activo\(sesion.resumen.chatbotsActivos == 1 ? "" : "s")",
                            avisos: sesion.resumen.esperanPersona
                        )

                        VStack(spacing: 14) {
                            TarjetaLana(
                                titulo: "Hola, \(nombre) 👋",
                                texto: "Hoy tus bots llevan \(sesion.resumen.mensajesMes) mensajes este mes y \(sesion.resumen.esperanPersona) persona\(sesion.resumen.esperanPersona == 1 ? "" : "s") te está\(sesion.resumen.esperanPersona == 1 ? "" : "n") esperando."
                            )

                            if sesion.resumen.esperanPersona > 0 {
                                NavigationLink {
                                    ChatsView(filtroInicial: .esperan, enPila: true)
                                } label: {
                                    HStack(spacing: 10) {
                                        Circle().fill(Theme.rosa).frame(width: 9, height: 9)
                                        Text("\(sesion.resumen.esperanPersona) cliente\(sesion.resumen.esperanPersona == 1 ? "" : "s") pide\(sesion.resumen.esperanPersona == 1 ? "" : "n") hablar con una persona")
                                            .font(Theme.cuerpo(14, peso: .semibold))
                                            .foregroundStyle(Theme.texto)
                                            .multilineTextAlignment(.leading)
                                        Spacer()
                                        Text("Ver →").font(Theme.cuerpo(13, peso: .semibold)).foregroundStyle(Theme.rosa)
                                    }
                                    .padding(14)
                                    .background(Theme.rosa.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.rosa.opacity(0.4)))
                                }
                                .buttonStyle(.plain)
                            }

                            // Plan
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text("Plan \(planBonito)").font(Theme.cuerpo(13, peso: .semibold)).foregroundStyle(Theme.texto)
                                    Spacer()
                                    Text("\(sesion.resumen.mensajesMes) mensajes").font(Theme.cuerpo(12)).foregroundStyle(Theme.textoSuave)
                                }
                                Text("Mensajes enviados este mes por tus chatbots y tu equipo.")
                                    .font(Theme.cuerpo(11.5)).foregroundStyle(Theme.textoSuave)
                            }
                            .tarjeta()

                            // Cifras
                            let r = sesion.resumen
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                                Cifra(valor: "\(r.conversacionesSemana)", etiqueta: "Conversaciones",
                                      detalle: tendencia(r.conversacionesSemana, r.conversacionesSemanaAnterior),
                                      colorDetalle: r.conversacionesSemana >= r.conversacionesSemanaAnterior ? Theme.verde : Theme.rosa)
                                Cifra(valor: "\(r.porcentajeBot)%", etiqueta: "Contestó el bot", detalle: "esta semana", colorDetalle: Theme.textoSuave)
                                Cifra(valor: "\(r.citasAgendadas)", etiqueta: "Citas agendadas", detalle: "por venir", colorDetalle: Theme.textoSuave)
                                Cifra(valor: "\(r.leadsNuevos)", etiqueta: "Leads nuevos", detalle: "últimos 7 días", colorDetalle: Theme.textoSuave)
                            }

                            if sesion.tienda != nil {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(Dinero.texto(r.vendidoHoy, moneda: sesion.tienda?.moneda ?? "$"))
                                            .font(Theme.titulo(22)).foregroundStyle(Theme.texto)
                                        Text("VENDIDO HOY").font(Theme.cuerpo(10.5, peso: .semibold)).tracking(1).foregroundStyle(Theme.textoEtiqueta)
                                    }
                                    Spacer()
                                    VStack(alignment: .trailing, spacing: 4) {
                                        Text("\(r.pedidosHoy)").font(Theme.titulo(22)).foregroundStyle(Theme.texto)
                                        Text("PEDIDOS HOY").font(Theme.cuerpo(10.5, peso: .semibold)).tracking(1).foregroundStyle(Theme.textoEtiqueta)
                                    }
                                }
                                .tarjeta()
                            }

                            Text("¿Qué quieres hacer?")
                                .font(Theme.titulo(16, peso: .bold))
                                .foregroundStyle(Theme.texto)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.top, 6)

                            NavigationLink { PedidosView(enPila: true) } label: {
                                FilaAccion(icono: "shippingbox.fill", titulo: "Despachar pedidos",
                                           detalle: "\(r.pedidosNuevos) nuevo\(r.pedidosNuevos == 1 ? "" : "s") por confirmar")
                            }.buttonStyle(.plain)

                            NavigationLink { ChatsView(enPila: true) } label: {
                                FilaAccion(icono: "bubble.left.and.bubble.right.fill", titulo: "Ver conversaciones",
                                           detalle: "Lo que tus clientes escriben hoy")
                            }.buttonStyle(.plain)

                            NavigationLink { CitasView(enPila: true) } label: {
                                FilaAccion(icono: "calendar", titulo: "Mi agenda",
                                           detalle: "\(r.citasAgendadas) cita\(r.citasAgendadas == 1 ? "" : "s") por venir")
                            }.buttonStyle(.plain)

                            Link(destination: Backend.plataforma) {
                                FilaAccion(icono: "desktopcomputer", titulo: "Configurar en la computadora",
                                           detalle: "Chatbots, tienda y resultados completos")
                            }.buttonStyle(.plain)
                        }
                        .padding(.horizontal, 18)
                        .padding(.bottom, 24)
                    }
                }
                .refreshable { await sesion.refrescarResumen() }
            }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var planBonito: String {
        let p = sesion.organizacion?.plan ?? ""
        switch p {
        case "growth": return "Crecimiento"
        case "starter": return "Inicial"
        case "pro": return "Pro"
        default: return p.capitalized
        }
    }

    private func tendencia(_ ahora: Int, _ antes: Int) -> String {
        guard antes > 0 else { return ahora > 0 ? "nuevas esta semana" : "sin cambios" }
        let pct = Int((Double(ahora - antes) / Double(antes) * 100).rounded())
        return pct >= 0 ? "+\(pct)% vs. semana pasada" : "\(pct)% vs. semana pasada"
    }
}
