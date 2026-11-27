import ClevertreeRoom
import SwiftUI

@main
struct ClevertreeApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    private let config = ClevertreeRoomConfig(
        apiBase: ClevertreeRoomConfig.defaultApiBase,
        channel: ClevertreeRoomConfig.universalChannel, // #web = clevertree.chat/chat
        title: "Clevertree Chat"
    )

    var body: some View {
        // Status bar / top safe area: system default.
        // Bottom nav + IME: handled inside ClevertreeRoomWebViewController
        // (keyboardLayoutGuide), mirroring Android MainActivity + ClevertreeRoom.
        ClevertreeRoomView(config: config)
            .preferredColorScheme(.dark)
    }
}
