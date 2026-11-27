#if canImport(UIKit) && !os(watchOS)
import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves bundled `fronts/room` assets over a custom HTTPS-like scheme.
/// iOS counterpart to Android `WebViewAssetLoader`.
///
/// Load: `https://clevertree.local/clevertree-room/live.html?channel=...`
public final class ClevertreeRoomAssetSchemeHandler: NSObject, WKURLSchemeHandler {
    public static let scheme = ClevertreeRoomConfig.assetScheme
    public static let host = ClevertreeRoomConfig.assetHost
    public static let baseURL = "\(scheme)://\(host)/"

    private let resourceRoot: URL

    public convenience override init() {
        self.init(bundle: .module)
    }

    public init(bundle: Bundle) {
        let root =
            bundle.resourceURL?
            .appendingPathComponent(ClevertreeRoomConfig.assetDirectoryName, isDirectory: true)
            ?? bundle.bundleURL
        self.resourceRoot = root
        super.init()
    }

    public func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        var path = url.path
        if path.hasPrefix("/") {
            path.removeFirst()
        }
        // Accept both /live.html and /clevertree-room/live.html
        if path.hasPrefix("\(ClevertreeRoomConfig.assetDirectoryName)/") {
            path = String(path.dropFirst(ClevertreeRoomConfig.assetDirectoryName.count + 1))
        }
        if path.isEmpty {
            path = ClevertreeRoomConfig.assetLiveHTML
        }

        let fileURL = resourceRoot.appendingPathComponent(path)
        guard fileURL.standardizedFileURL.path.hasPrefix(resourceRoot.standardizedFileURL.path),
              FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL)
        else {
            let err = URLError(.fileDoesNotExist)
            urlSchemeTask.didFailWithError(err)
            return
        }

        let mime = Self.mimeType(for: fileURL)
        let response = URLResponse(
            url: url,
            mimeType: mime,
            expectedContentLength: data.count,
            textEncodingName: "utf-8"
        )
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    public func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No streaming cancel needed for discrete file responses.
    }

    public static func mimeType(for fileURL: URL) -> String {
        let ext = fileURL.pathExtension.lowercased()
        switch ext {
        case "html", "htm": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        default:
            if let ut = UTType(filenameExtension: ext),
               let mime = ut.preferredMIMEType
            {
                return mime
            }
            return "application/octet-stream"
        }
    }
}
#endif
