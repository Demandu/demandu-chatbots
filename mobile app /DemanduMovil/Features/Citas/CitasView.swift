import SwiftUI
import Supabase

/// La agenda: las citas que agendó el bot, por día.
struct CitasView: View {
    @Environment(Sesion.self) private var sesion
    @State private var citas: [Cita] = []
    @State private var cargando = true
    @State private var error: String?
    @State private var diaElegido: Date = Calendar.current.startOfDay(for: Date())
    @State private var verPasadas = false
    var enPila: Bool = false

    private var cal: Calendar { Calendar.current }

    /// Los próximos 14 días para la tira de arriba.
    private var dias: [Date] {
        (0..<14).compactMap { cal.date(byAdding: .day, value: $0, to: cal.startOfDay(for: Date())) }
    }

    private func citasDe(_ dia: Date) -> [Cita] {
        citas.filter { c in
            guard let i = c.inicio else { return false }
            return cal.isDate(i, inSameDayAs: dia)
        }.sorted { ($0.inicio ?? .distantPast) < ($1.inicio ?? .distantPast) }
    }

    private var pasadas: [Cita] {
        citas.filter { ($0.inicio ?? .distantFuture) < cal.startOfDay(for: Date()) }
            .sorted { ($0.inicio ?? .distantPast) > ($1.inicio ?? .distantPast) }
    }

    private var proximas: Int {
        citas.filter { ($0.inicio ?? .distantPast) >= Date() && !$0.cancelada }.count
    }

    var body: some View {
        Pantalla {
            ScrollView {
                VStack(spacing: 12) {
                    Encabezado(titulo: "Citas", subtitulo: "Tu agenda de la semana", avisos: 0, atras: enPila)

                    Text("Estas son las citas que tu bot agendó. Para moverlas o cancelarlas, hazlo desde tu calendario: el cliente se entera por WhatsApp.")
                        .font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 18)

                    // Tira de días
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(dias, id: \.self) { d in
                                let activo = cal.isDate(d, inSameDayAs: diaElegido)
                                let n = citasDe(d).filter { !$0.cancelada }.count
                                Button {
                                    withAnimation(.easeOut(duration: 0.15)) { diaElegido = d; verPasadas = false }
                                } label: {
                                    VStack(spacing: 4) {
                                        Text(nombreDia(d)).font(Theme.cuerpo(11, peso: .semibold)).foregroundStyle(activo ? .white : Theme.textoSuave)
                                        Text("\(cal.component(.day, from: d))").font(Theme.titulo(18)).foregroundStyle(activo ? .white : Theme.texto)
                                        Circle().fill(n > 0 ? (activo ? Color.white : Theme.rosa) : .clear).frame(width: 5, height: 5)
                                    }
                                    .frame(width: 52, height: 68)
                                    .background(
                                        Group {
                                            if activo { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.degradado) }
                                            else { RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.tarjeta2) }
                                        }
                                    )
                                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(activo ? .clear : Theme.borde))
                                }
                                .buttonStyle(.plain)
                            }
                            Button {
                                withAnimation { verPasadas.toggle() }
                            } label: {
                                Text("Pasadas").font(Theme.cuerpo(12, peso: .semibold))
                                    .foregroundStyle(verPasadas ? .white : Theme.textoSuave)
                                    .frame(width: 70, height: 68)
                                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(verPasadas ? Theme.violeta : Theme.tarjeta2))
                                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.borde))
                            }
                            .buttonStyle(.plain)
                        }
                        .padding(.horizontal, 18)
                    }

                    if let error { Aviso(texto: error).padding(.horizontal, 18) }

                    let lista = verPasadas ? Array(pasadas.prefix(30)) : citasDe(diaElegido)
                    if cargando && citas.isEmpty {
                        ProgressView().tint(.white).padding(.top, 30)
                    } else if lista.isEmpty {
                        Vacio(icono: "calendar.badge.clock",
                              titulo: verPasadas ? "Sin citas pasadas" : "Nada agendado este día",
                              detalle: "Cuando un cliente agende con el bot, la cita aparece aquí.")
                    } else {
                        Text(verPasadas ? "Citas pasadas" : Fechas.diaLargo.string(from: diaElegido).capitalized)
                            .font(Theme.titulo(15, peso: .bold)).foregroundStyle(Theme.texto)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18)
                        LazyVStack(spacing: 10) {
                            ForEach(lista) { c in TarjetaCita(cita: c) }
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

    private func nombreDia(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX")
        f.dateFormat = "EEE"
        return f.string(from: d).replacingOccurrences(of: ".", with: "").capitalized
    }

    func cargar() async {
        guard let orgId = sesion.orgId else { cargando = false; return }
        let desde = cal.date(byAdding: .day, value: -60, to: Date())!
        do {
            let lista: [Cita] = try await Backend.client
                .from("citas")
                .select("id, contact_id, conversation_id, proveedor, titulo, nombre, correo, estado, inicio, fin, enlace, enlace_cancelar, recordatorio_enviado_at, respuesta")
                .eq("org_id", value: orgId.uuidString)
                .gte("inicio", value: Fechas.iso(desde))
                .order("inicio", ascending: true)
                .limit(300)
                .execute()
                .value
            citas = lista
            error = nil
        } catch {
            self.error = "No pude cargar las citas: \(error.localizedDescription)"
        }
        cargando = false
    }
}

struct TarjetaCita: View {
    let cita: Cita

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 2) {
                Text(cita.inicio.map { Fechas.hora.string(from: $0) } ?? "--:--")
                    .font(Theme.titulo(17)).foregroundStyle(cita.cancelada ? Theme.textoSuave : Theme.texto)
                Text("\(cita.duracionMin) min").font(Theme.cuerpo(11)).foregroundStyle(Theme.textoSuave)
            }
            .frame(width: 58)

            VStack(alignment: .leading, spacing: 6) {
                Text(cita.nombre ?? cita.titulo ?? "Cita")
                    .font(Theme.cuerpo(15, peso: .semibold))
                    .foregroundStyle(cita.cancelada ? Theme.textoSuave : Theme.texto)
                    .strikethrough(cita.cancelada)
                if let t = cita.titulo, cita.nombre != nil, t != cita.nombre {
                    Text(t).font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave).lineLimit(2)
                }
                HStack(spacing: 6) {
                    if cita.cancelada {
                        Pildora(texto: "Cancelada", color: Theme.textoSuave)
                    } else if cita.confirmada {
                        Pildora(texto: "Confirmada", color: Theme.verde)
                    } else if cita.recordatorioEnviadoAt != nil {
                        Pildora(texto: "Recordatorio enviado", color: Theme.azul)
                    } else {
                        Pildora(texto: "Sin confirmar", color: Theme.ambar)
                    }
                    if let p = cita.proveedor { Text(p == "google" ? "Google Calendar" : p.capitalized).font(Theme.cuerpo(11)).foregroundStyle(Theme.textoSuave) }
                }
                HStack(spacing: 8) {
                    if let convId = cita.conversationId {
                        NavigationLink { ChatDesdePedido(conversacionId: convId) } label: {
                            Text("Escribirle").frame(maxWidth: .infinity)
                        }.buttonStyle(BotonSecundarioStyle())
                    }
                    if let enlace = cita.enlace, let url = URL(string: enlace) {
                        Link(destination: url) { Text("Ver en calendario").frame(maxWidth: .infinity) }
                            .buttonStyle(BotonSecundarioStyle())
                    }
                }
                .padding(.top, 2)
            }
        }
        .tarjeta()
        .opacity(cita.cancelada ? 0.7 : 1)
    }
}
