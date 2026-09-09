import SwiftUI

/// Encabezado de cada pantalla: título grande + subtítulo + campana opcional.
struct Encabezado: View {
    let titulo: String
    var subtitulo: String? = nil
    var avisos: Int = 0
    var atras: Bool = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if atras {
                Button { dismiss() } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(Theme.texto)
                        .frame(width: 38, height: 38)
                        .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
                }
                .buttonStyle(.plain)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo)
                    .font(Theme.titulo(24))
                    .foregroundStyle(Theme.texto)
                    .lineLimit(1)
                if let subtitulo, !subtitulo.isEmpty {
                    Text(subtitulo)
                        .font(Theme.cuerpo(13))
                        .foregroundStyle(Theme.textoSuave)
                        .lineLimit(1)
                }
            }
            Spacer()
            if avisos > 0 {
                ZStack(alignment: .topTrailing) {
                    Text("\(avisos)")
                        .font(Theme.cuerpo(15, peso: .semibold))
                        .foregroundStyle(Theme.textoSuave)
                        .frame(width: 38, height: 38)
                        .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
                    Circle().fill(Theme.rosa).frame(width: 9, height: 9).offset(x: 3, y: -3)
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }
}

/// Avatar con iniciales y degradado.
struct Avatar: View {
    let iniciales: String
    var tamano: CGFloat = 44
    var body: some View {
        Text(iniciales)
            .font(Theme.cuerpo(tamano * 0.34, peso: .bold))
            .foregroundStyle(.white)
            .frame(width: tamano, height: tamano)
            .background(Theme.degradado, in: RoundedRectangle(cornerRadius: tamano * 0.32, style: .continuous))
    }
}

/// Píldora de estado ("Espera persona", "Pagado", "Confirmada"…).
struct Pildora: View {
    let texto: String
    var color: Color = Theme.violeta
    var relleno: Bool = false
    var body: some View {
        Text(texto)
            .font(Theme.cuerpo(11, peso: .semibold))
            .foregroundStyle(relleno ? .white : color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(relleno ? color : color.opacity(0.14), in: Capsule())
            .overlay(Capsule().stroke(color.opacity(relleno ? 0 : 0.35), lineWidth: 1))
            .lineLimit(1)
    }
}

/// Filtros horizontales tipo chips.
struct Opcion<T: Hashable>: Identifiable {
    let valor: T
    let titulo: String
    var id: T { valor }
}

struct Filtros<T: Hashable>: View {
    let opciones: [Opcion<T>]
    @Binding var elegido: T
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(opciones) { opcion in
                    let valor = opcion.valor
                    let titulo = opcion.titulo
                    let activo = valor == elegido
                    Button {
                        withAnimation(.easeOut(duration: 0.15)) { elegido = valor }
                    } label: {
                        Text(titulo)
                            .font(Theme.cuerpo(13, peso: .semibold))
                            .foregroundStyle(activo ? .white : Theme.textoSuave)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Group {
                                    if activo { Capsule().fill(Theme.degradado) }
                                    else { Capsule().fill(Theme.tarjeta2) }
                                }
                            )
                            .overlay(Capsule().stroke(activo ? .clear : Theme.borde, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 18)
        }
    }
}

/// Un número grande con su etiqueta, para el tablero del inicio.
struct Cifra: View {
    let valor: String
    let etiqueta: String
    var detalle: String? = nil
    var colorDetalle: Color = Theme.verde
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(valor)
                .font(Theme.titulo(26))
                .foregroundStyle(Theme.texto)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
            Text(etiqueta.uppercased())
                .font(Theme.cuerpo(10.5, peso: .semibold))
                .tracking(1)
                .foregroundStyle(Theme.textoEtiqueta)
            if let detalle {
                Text(detalle)
                    .font(Theme.cuerpo(12, peso: .semibold))
                    .foregroundStyle(colorDetalle)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjeta()
    }
}

/// Fila de acción con flecha ("Despachar pedidos", "Mi tienda"…).
struct FilaAccion: View {
    let icono: String
    let titulo: String
    let detalle: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icono)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(Theme.texto)
                .frame(width: 38, height: 38)
                .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(Theme.borde))
            VStack(alignment: .leading, spacing: 2) {
                Text(titulo).font(Theme.cuerpo(15, peso: .semibold)).foregroundStyle(Theme.texto)
                Text(detalle).font(Theme.cuerpo(12.5)).foregroundStyle(Theme.textoSuave).lineLimit(1)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.textoSuave)
        }
        .tarjeta()
    }
}

/// Mensaje de "no hay nada" con una frase amable.
struct Vacio: View {
    let icono: String
    let titulo: String
    let detalle: String
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icono).font(.system(size: 30)).foregroundStyle(Theme.textoSuave)
            Text(titulo).font(Theme.cuerpo(16, peso: .semibold)).foregroundStyle(Theme.texto)
            Text(detalle).font(Theme.cuerpo(13)).foregroundStyle(Theme.textoSuave).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .padding(.horizontal, 24)
    }
}

/// Aviso rojo/ámbar de error dentro de una pantalla.
struct Aviso: View {
    let texto: String
    var color: Color = Theme.rojo
    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 3).fill(color).frame(width: 4)
            Text(texto).font(Theme.cuerpo(13)).foregroundStyle(Theme.textoTarjeta)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(color.opacity(0.35)))
    }
}

/// La tarjeta de Lana con su foto.
struct TarjetaLana: View {
    let titulo: String
    let texto: String
    var body: some View {
        HStack(spacing: 12) {
            Image("Lana")
                .resizable()
                .scaledToFit()
                .frame(width: 64, height: 64)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text(titulo).font(Theme.titulo(15, peso: .bold)).foregroundStyle(Theme.texto)
                Text(texto).font(Theme.cuerpo(13)).foregroundStyle(Theme.textoTarjeta).lineSpacing(2)
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(
            LinearGradient(colors: [Theme.rosa.opacity(0.18), Theme.violeta.opacity(0.22)],
                           startPoint: .leading, endPoint: .trailing),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Theme.rosa.opacity(0.3)))
    }
}

/// Contenedor de pantalla: fondo con luz + scroll + "jalar para actualizar".
struct Pantalla<Contenido: View>: View {
    let contenido: () -> Contenido
    init(@ViewBuilder contenido: @escaping () -> Contenido) { self.contenido = contenido }
    var body: some View {
        ZStack {
            Theme.fondoConLuz
            contenido()
        }
    }
}
