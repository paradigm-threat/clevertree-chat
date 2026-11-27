#if canImport(UIKit) && !os(watchOS)
import UIKit
import WebKit

/// UIKit host for the Clevertree room WKWebView.
///
/// Parity with Android `ClevertreeRoom`:
/// - JS + DOM storage on
/// - Bundled assets via custom scheme (≈ WebViewAssetLoader)
/// - Media capture permission hooks
/// - Keyboard + home-indicator insets so the composer stays above the IME
@MainActor
public final class ClevertreeRoomWebViewController: UIViewController {
    public var config: ClevertreeRoomConfig {
        didSet {
            if oldValue != config {
                reloadRoom()
            }
        }
    }

    public var onMediaCaptureDecision: ((Bool) -> Void)?

    private let webView: WKWebView
    private var keyboardObserverTokens: [NSObjectProtocol] = []
    private var bottomConstraint: NSLayoutConstraint?

    public init(config: ClevertreeRoomConfig) {
        self.config = config

        let configuration = WKWebViewConfiguration()
        let schemeHandler = ClevertreeRoomAssetSchemeHandler()
        configuration.setURLSchemeHandler(
            schemeHandler,
            forURLScheme: ClevertreeRoomAssetSchemeHandler.scheme
        )
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.websiteDataStore = .default()

        webView = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    deinit {
        keyboardObserverTokens.forEach { NotificationCenter.default.removeObserver($0) }
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.043, green: 0.071, blue: 0.063, alpha: 1) // #0B1210

        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = .clear
        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        view.addSubview(webView)

        let top = webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor)
        let leading = webView.leadingAnchor.constraint(equalTo: view.leadingAnchor)
        let trailing = webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)

        // Prefer keyboardLayoutGuide (iOS 15+) so the room shrinks above the IME —
        // mirrors Android imePadding() + navigationBarsPadding().
        let bottom: NSLayoutConstraint
        if #available(iOS 15.0, *) {
            bottom = webView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        } else {
            bottom = webView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
            observeKeyboard()
        }
        bottomConstraint = bottom

        NSLayoutConstraint.activate([top, leading, trailing, bottom])
        reloadRoom()
    }

    public func reloadRoom() {
        guard let url = config.schemeAssetURL() else {
            assertionFailure("ClevertreeRoom could not build scheme URL")
            return
        }
        webView.load(URLRequest(url: url))
    }

    private func observeKeyboard() {
        let center = NotificationCenter.default
        let willChange = center.addObserver(
            forName: UIResponder.keyboardWillChangeFrameNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            Task { @MainActor in self?.applyKeyboard(note: note) }
        }
        let willHide = center.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { [weak self] note in
            Task { @MainActor in self?.applyKeyboard(note: note, hide: true) }
        }
        keyboardObserverTokens = [willChange, willHide]
    }

    private func applyKeyboard(note: Notification, hide: Bool = false) {
        guard let bottomConstraint else { return }
        let duration =
            (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?
            .doubleValue ?? 0.25
        var inset: CGFloat = 0
        if !hide,
           let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
        {
            let converted = view.convert(frame, from: nil)
            inset = max(0, view.bounds.maxY - converted.minY - view.safeAreaInsets.bottom)
        }
        bottomConstraint.constant = -inset
        UIView.animate(withDuration: duration) {
            self.view.layoutIfNeeded()
        }
    }
}

extension ClevertreeRoomWebViewController: WKNavigationDelegate {
    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if navigationAction.navigationType == .linkActivated,
           let scheme = url.scheme?.lowercased(),
           (scheme == "http" || scheme == "https"),
           url.host != ClevertreeRoomAssetSchemeHandler.host
        {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}

extension ClevertreeRoomWebViewController: WKUIDelegate {
    @available(iOS 15.0, *)
    public func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
        onMediaCaptureDecision?(true)
    }

    public func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil {
            webView.load(navigationAction.request)
        }
        return nil
    }
}
#endif
