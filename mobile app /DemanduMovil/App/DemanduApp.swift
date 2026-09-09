import SwiftUI

@main
struct DemanduApp: App {
    @State private var session = Sesion()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .preferredColorScheme(.dark)
                .tint(Theme.rosa)
        }
    }
}

/// Decide qué se ve: la pantalla de entrar, una carga, o la app completa.
struct RootView: View {
    @Environment(Sesion.self) private var session

    var body: some View {
        ZStack {
            Theme.fondo.ignoresSafeArea()
            switch session.estado {
            case .cargando:
                ProgressView().tint(.white)
            case .fuera:
                EntrarView()
            case .dentro:
                MainTabView()
            }
        }
        .task { await session.arrancar() }
    }
}

/// La barra inferior: Inicio, Chats, Pedidos, Citas, Ajustes.
struct MainTabView: View {
    @Environment(Sesion.self) private var session

    init() {
        let apariencia = UITabBarAppearance()
        apariencia.configureWithOpaqueBackground()
        apariencia.backgroundColor = UIColor(Theme.fondoTab)
        apariencia.shadowColor = UIColor(Theme.borde)
        UITabBar.appearance().standardAppearance = apariencia
        UITabBar.appearance().scrollEdgeAppearance = apariencia
    }

    var body: some View {
        TabView {
            NavigationStack { InicioView() }
                .tabItem { Label("Inicio", systemImage: "house.fill") }
            NavigationStack { ChatsView() }
                .tabItem { Label("Chats", systemImage: "bubble.left.and.bubble.right.fill") }
                .badge(session.resumen.esperanPersona)
            NavigationStack { PedidosView() }
                .tabItem { Label("Pedidos", systemImage: "bag.fill") }
                .badge(session.resumen.pedidosNuevos)
            NavigationStack { CitasView() }
                .tabItem { Label("Citas", systemImage: "calendar") }
            NavigationStack { AjustesView() }
                .tabItem { Label("Ajustes", systemImage: "gearshape.fill") }
        }
    }
}
