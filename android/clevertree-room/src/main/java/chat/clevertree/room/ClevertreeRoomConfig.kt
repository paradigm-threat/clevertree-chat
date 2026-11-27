package chat.clevertree.room

import java.net.URLEncoder
import java.nio.charset.StandardCharsets

/**
 * Configuration for the embeddable Clevertree IRC+SI room.
 *
 * Loads bundled [fronts/room/live.html] via [WebViewAssetLoader] under
 * [ASSET_LOADER_DOMAIN] so the AAR pins UI version while hosts point [apiBase]
 * at their chat edge (CORS-friendly https origin).
 */
data class ClevertreeRoomConfig(
    val apiBase: String = DEFAULT_API_BASE,
    val channel: String = DEFAULT_CHANNEL,
    val title: String = DEFAULT_TITLE,
    val collection: String = "",
    val topic: String = "",
    val theme: String = "",
    val aiOpen: Boolean = false,
    val surface: String = "embed",
) {
    /** Asset path under `assets/` (no leading slash). */
    fun assetPath(): String = ASSET_LIVE_HTML

    /**
     * HTTPS URL served by [androidx.webkit.WebViewAssetLoader] from bundled assets.
     * Pure JVM — safe for unit tests.
     */
    fun assetUrl(): String {
        val q = LinkedHashMap<String, String>()
        q["channel"] = channel
        q["api"] = apiBase.trimEnd('/')
        q["title"] = title
        if (collection.isNotBlank()) q["collection"] = collection
        if (topic.isNotBlank()) q["topic"] = topic
        if (theme == "light" || theme == "dark") q["theme"] = theme
        if (aiOpen) q["ai"] = "1"
        if (surface == "side") q["surface"] = "side"
        val query =
            q.entries.joinToString("&") { (k, v) ->
                "${enc(k)}=${enc(v)}"
            }
        return "$ASSET_LOADER_BASE$ASSET_LIVE_HTML?$query"
    }

    companion object {
        const val DEFAULT_API_BASE = "https://api.clevertree.chat"
        /**
         * Universal room — same IRC channel as https://clevertree.chat/chat.
         * Default for the Clevertree Chat app and unassigned / generic embeds.
         */
        const val DEFAULT_CHANNEL = "#web"
        const val UNIVERSAL_CHANNEL = DEFAULT_CHANNEL
        const val DEFAULT_TITLE = "Clevertree Chat"
        const val ASSET_LIVE_HTML = "clevertree-room/live.html"

        /** Domain used by androidx WebViewAssetLoader (do not change). */
        const val ASSET_LOADER_DOMAIN = "appassets.androidplatform.net"
        const val ASSET_LOADER_BASE = "https://$ASSET_LOADER_DOMAIN/assets/"

        private fun enc(value: String): String =
            URLEncoder.encode(value, StandardCharsets.UTF_8.name()).replace("+", "%20")
    }
}
