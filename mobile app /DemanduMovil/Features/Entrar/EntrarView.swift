import SwiftUI

/// "Entra a tu cuenta": el mismo correo y contraseña que en la computadora.
struct EntrarView: View {
    @Environment(Sesion.self) private var sesion
    @State private var correo = ""
    @State private var contrasena = ""
    @State private var cargando = false
    @State private var error: String?
    @State private var avisoRecuperacion: String?
    @FocusState private var enfoque: Campo?

    enum Campo { case correo, contrasena }

    var body: some View {
        ZStack {
            Theme.fondoConLuz
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Image("LogoDemandu")
                        .resizable()
                        .scaledToFit()
                        .frame(height: 26)
                        .padding(.top, 60)

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Entra a tu cuenta")
                            .font(Theme.titulo(30))
                            .foregroundStyle(Theme.texto)
                        Text("Con el mismo correo que usas en la computadora.")
                            .font(Theme.cuerpo(14))
                            .foregroundStyle(Theme.textoSuave)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        campo("Tu correo") {
                            TextField("", text: $correo, prompt: Text("rocio@tu-negocio.com").foregroundStyle(Theme.textoSuave.opacity(0.6)))
                                .keyboardType(.emailAddress)
                                .textContentType(.username)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($enfoque, equals: .correo)
                                .submitLabel(.next)
                                .onSubmit { enfoque = .contrasena }
                        }
                        campo("Tu contraseña") {
                            SecureField("", text: $contrasena, prompt: Text("••••••••").foregroundStyle(Theme.textoSuave.opacity(0.6)))
                                .textContentType(.password)
                                .focused($enfoque, equals: .contrasena)
                                .submitLabel(.go)
                                .onSubmit { Task { await entrar() } }
                        }
                    }

                    if let error { Aviso(texto: error) }
                    if let avisoRecuperacion { Aviso(texto: avisoRecuperacion, color: Theme.verde) }
                    if let general = sesion.errorGeneral { Aviso(texto: general, color: Theme.ambar) }

                    Button {
                        Task { await entrar() }
                    } label: {
                        if cargando { ProgressView().tint(.white) } else { Text("Entrar") }
                    }
                    .buttonStyle(BotonPrincipalStyle())
                    .disabled(cargando || correo.isEmpty || contrasena.isEmpty)
                    .opacity(correo.isEmpty || contrasena.isEmpty ? 0.6 : 1)

                    Button("Se me olvidó la contraseña") {
                        Task { await recuperar() }
                    }
                    .buttonStyle(BotonSecundarioStyle())
                    .disabled(cargando)

                    Text("Al entrar, esta app te avisa cuando alguien pida hablar con una persona o llegue un pedido.")
                        .font(Theme.cuerpo(12.5))
                        .foregroundStyle(Theme.textoSuave)
                        .lineSpacing(3)
                }
                .padding(.horizontal, 22)
                .padding(.bottom, 40)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private func campo<C: View>(_ titulo: String, @ViewBuilder _ contenido: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(titulo).font(Theme.cuerpo(12.5, peso: .semibold)).foregroundStyle(Theme.textoEtiqueta)
            contenido()
                .font(Theme.cuerpo(16))
                .foregroundStyle(Theme.texto)
                .padding(.horizontal, 14)
                .padding(.vertical, 13)
                .background(Theme.tarjeta2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.borde))
        }
    }

    private func entrar() async {
        guard !cargando else { return }
        cargando = true
        error = nil
        avisoRecuperacion = nil
        sesion.errorGeneral = nil
        do {
            try await sesion.entrar(correo: correo, contrasena: contrasena)
        } catch {
            let m = error.localizedDescription.lowercased()
            if m.contains("invalid login") || m.contains("credentials") {
                self.error = "El correo o la contraseña no coinciden. Revísalos e intenta otra vez."
            } else if m.contains("email not confirmed") {
                self.error = "Todavía no has confirmado tu correo. Busca el mensaje de Demandu en tu bandeja."
            } else {
                self.error = "No pude entrar: \(error.localizedDescription)"
            }
        }
        cargando = false
    }

    private func recuperar() async {
        guard !correo.isEmpty else {
            error = "Escribe tu correo arriba y vuelve a tocar este botón."
            return
        }
        cargando = true
        error = nil
        do {
            try await sesion.recuperarContrasena(correo: correo)
            avisoRecuperacion = "Listo. Te mandamos un correo con el enlace para crear una contraseña nueva."
        } catch {
            self.error = "No pude mandar el correo: \(error.localizedDescription)"
        }
        cargando = false
    }
}
