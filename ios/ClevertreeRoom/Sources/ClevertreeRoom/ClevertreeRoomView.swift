#if canImport(SwiftUI) && canImport(UIKit) && !os(watchOS)
import SwiftUI
import UIKit

/// SwiftUI embed of the Clevertree IRC+SI room (parity with Android `ClevertreeRoom` composable).
///
/// ```swift
/// ClevertreeRoomView(
///   config: ClevertreeRoomConfig(
///     apiBase: "https://api.clevertree.chat",
///     channel: "#web",
///     title: "Clevertree Chat"
///   )
/// )
/// ```
public struct ClevertreeRoomView: View {
    public var config: ClevertreeRoomConfig
    /// When true, bottom home-indicator is handled inside the WebView controller
    /// via keyboardLayoutGuide / safe area (Android applies nav padding on the WebView).
    public var ignoresBottomSafeArea: Bool

    public init(
        config: ClevertreeRoomConfig,
        ignoresBottomSafeArea: Bool = true
    ) {
        self.config = config
        self.ignoresBottomSafeArea = ignoresBottomSafeArea
    }

    public var body: some View {
        Representable(config: config)
            .background(Color(red: 0.043, green: 0.071, blue: 0.063))
            .ignoresSafeArea(.container, edges: ignoresBottomSafeArea ? .bottom : [])
    }

    private struct Representable: UIViewControllerRepresentable {
        var config: ClevertreeRoomConfig

        func makeUIViewController(context: Context) -> ClevertreeRoomWebViewController {
            ClevertreeRoomWebViewController(config: config)
        }

        func updateUIViewController(
            _ uiViewController: ClevertreeRoomWebViewController,
            context: Context
        ) {
            uiViewController.config = config
        }
    }
}
#endif
