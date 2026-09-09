import SwiftUI

/// Colores y tipografía del Design System 2.0 de Demandu, tal como están en el prototipo.
enum Theme {
    // Fondos
    static let fondo     = Color(hex: 0x0A0A28)
    static let fondoTab  = Color(hex: 0x0D0D2E)
    static let tarjeta   = Color(hex: 0x14153A)
    static let tarjeta2  = Color(hex: 0x171838)
    static let borde     = Color(hex: 0x2A2C55)
    static let bordeSuave = Color(hex: 0x3B3D6E)

    // Marca
    static let rosa      = Color(hex: 0xF64A97)
    static let violeta   = Color(hex: 0x6E42FF)
    static let azul      = Color(hex: 0x3A85FF)
    static let verde     = Color(hex: 0x3DDC97)
    static let ambar     = Color(hex: 0xFFC53D)
    static let rojo      = Color(hex: 0xFF5C5C)

    // Texto
    static let texto     = Color(hex: 0xEDEEFF)
    static let textoSuave = Color(hex: 0x9A9CC7)
    static let textoEtiqueta = Color(hex: 0xA9ABD2)
    static let textoTarjeta = Color(hex: 0xC9CAE8)

    static let degradado = LinearGradient(colors: [rosa, violeta], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let degradadoAzul = LinearGradient(colors: [violeta, azul], startPoint: .topLeading, endPoint: .bottomTrailing)

    /// Fondo con los dos resplandores (rosa abajo-izquierda, violeta arriba-derecha).
    static var fondoConLuz: some View {
        ZStack {
            fondo
            RadialGradient(colors: [violeta.opacity(0.22), .clear], center: .topTrailing, startRadius: 0, endRadius: 420)
            RadialGradient(colors: [rosa.opacity(0.16), .clear], center: .bottomLeading, startRadius: 0, endRadius: 420)
        }
        .ignoresSafeArea()
    }

    // Tipografía: Sora para títulos (si no está instalada, cae a la redonda del sistema).
    static func titulo(_ size: CGFloat, peso: Font.Weight = .heavy) -> Font {
        if UIFont(name: "Sora-Bold", size: size) != nil {
            return .custom(peso == .heavy ? "Sora-ExtraBold" : "Sora-Bold", size: size)
        }
        return .system(size: size, weight: peso, design: .rounded)
    }

    static func cuerpo(_ size: CGFloat, peso: Font.Weight = .regular) -> Font {
        .system(size: size, weight: peso)
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }

    /// Color a partir de un texto "#RRGGBB" (las etiquetas lo guardan así).
    init?(hexString: String) {
        var s = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(hex: v)
    }
}

// MARK: - Modificadores reutilizables

struct TarjetaStyle: ViewModifier {
    var relleno: Color = Theme.tarjeta
    var radio: CGFloat = 18
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(relleno, in: RoundedRectangle(cornerRadius: radio, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radio, style: .continuous).stroke(Theme.borde, lineWidth: 1))
    }
}

extension View {
    func tarjeta(relleno: Color = Theme.tarjeta, radio: CGFloat = 18) -> some View {
        modifier(TarjetaStyle(relleno: relleno, radio: radio))
    }
}

/// Botón principal con el degradado rosa → violeta.
struct BotonPrincipalStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.cuerpo(15, peso: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Theme.degradado, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}

/// Botón secundario: fondo oscuro con borde.
struct BotonSecundarioStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.cuerpo(14, peso: .semibold))
            .foregroundStyle(Theme.texto)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.8 : 1)
    }
}
