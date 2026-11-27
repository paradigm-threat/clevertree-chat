import Foundation

/// Configuration for the embeddable Clevertree IRC+SI room.
///
/// Mirrors Android `ClevertreeRoomConfig`. Loads bundled `fronts/room/live.html`
/// from package resources (synced by `ios/scripts/sync-room-assets.sh`).
public struct ClevertreeRoomConfig: Equatable, Sendable {
    public var apiBase: String
    public var channel: String
    public var title: String
    public var collection: String
    public var topic: String
    public var theme: String
    public var aiOpen: Bool
    public var surface: String

    public static let defaultApiBase = "https://api.clevertree.chat"
    /// Universal room — same IRC channel as https://clevertree.chat/chat.
    public static let defaultChannel = "#web"
    public static let universalChannel = defaultChannel
    public static let defaultTitle = "Clevertree Chat"
    public static let assetLiveHTML = "live.html"
    /// Bundle subdirectory under SPM resources (matches Android `clevertree-room/`).
    public static let assetDirectoryName = "clevertree-room"
    /// Custom scheme served by `ClevertreeRoomAssetSchemeHandler` (≈ Android WebViewAssetLoader).
    public static let assetScheme = "clevertree-room"
    public static let assetHost = "appassets.clevertree.local"

    public init(
        apiBase: String = Self.defaultApiBase,
        channel: String = Self.defaultChannel,
        title: String = Self.defaultTitle,
        collection: String = "",
        topic: String = "",
        theme: String = "",
        aiOpen: Bool = false,
        surface: String = "embed"
    ) {
        self.apiBase = apiBase
        self.channel = channel
        self.title = title
        self.collection = collection
        self.topic = topic
        self.theme = theme
        self.aiOpen = aiOpen
        self.surface = surface
    }

    /// Relative asset path under the bundled room directory.
    public func assetPath() -> String {
        "\(Self.assetDirectoryName)/\(Self.assetLiveHTML)"
    }

    /// Query string items for live.html (channel, api, title, optional fields).
    public func queryItems() -> [URLQueryItem] {
        let trimmedApi = apiBase.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var items: [URLQueryItem] = [
            URLQueryItem(name: "channel", value: channel),
            URLQueryItem(name: "api", value: trimmedApi),
            URLQueryItem(name: "title", value: title),
        ]
        if !collection.isEmpty {
            items.append(URLQueryItem(name: "collection", value: collection))
        }
        if !topic.isEmpty {
            items.append(URLQueryItem(name: "topic", value: topic))
        }
        if theme == "light" || theme == "dark" {
            items.append(URLQueryItem(name: "theme", value: theme))
        }
        if aiOpen {
            items.append(URLQueryItem(name: "ai", value: "1"))
        }
        if surface == "side" {
            items.append(URLQueryItem(name: "surface", value: "side"))
        }
        return items
    }

    /// Scheme URL for WKWebView (preserves query — preferred load path).
    public func schemeAssetURL() -> URL? {
        var components = URLComponents()
        components.scheme = Self.assetScheme
        components.host = Self.assetHost
        components.path = "/\(Self.assetDirectoryName)/\(Self.assetLiveHTML)"
        components.queryItems = queryItems()
        return components.url
    }

    /// String form of the scheme URL (mirrors Android `assetUrl()` for tests).
    public func assetUrl() -> String {
        schemeAssetURL()?.absoluteString
            ?? "\(Self.assetScheme)://\(Self.assetHost)/\(assetPath())?\(encodedQueryString())"
    }

    /// File URL to bundled live.html (no query). Prefer `schemeAssetURL()` for loads.
    public func assetFileURL() -> URL? {
        assetFileURL(bundle: .module)
    }

    public func assetFileURL(bundle: Bundle) -> URL? {
        bundle.resourceURL?
            .appendingPathComponent(Self.assetDirectoryName, isDirectory: true)
            .appendingPathComponent(Self.assetLiveHTML)
    }

    /// Directory URL for `loadFileURL(_:allowingReadAccessTo:)` fallback.
    public func assetReadAccessURL() -> URL? {
        assetReadAccessURL(bundle: .module)
    }

    public func assetReadAccessURL(bundle: Bundle) -> URL? {
        bundle.resourceURL?
            .appendingPathComponent(Self.assetDirectoryName, isDirectory: true)
    }

    /// Percent-encoded query string (Android-compatible encoding for tests).
    public func encodedQueryString() -> String {
        queryItems()
            .compactMap { item -> String? in
                guard
                    let name = item.name.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
                    let raw = item.value,
                    let value = raw.addingPercentEncoding(withAllowedCharacters: Self.queryValueAllowed)
                else { return nil }
                return "\(name)=\(value)"
            }
            .joined(separator: "&")
    }

    private static let queryValueAllowed: CharacterSet = {
        var set = CharacterSet.urlQueryAllowed
        set.remove(charactersIn: "&+=?")
        return set
    }()
}
