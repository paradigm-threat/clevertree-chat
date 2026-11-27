package chat.clevertree.app

import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlin.concurrent.thread

/**
 * Posts an ask into the chat-host (same path as web room submit).
 * Runs off the main thread; [onResult] is invoked on a worker thread.
 */
object ChatSubmit {
    fun post(
        apiBase: String,
        channel: String,
        body: String,
        name: String = "",
        onResult: (Result<Unit>) -> Unit,
    ) {
        thread(name = "ct-chat-submit") {
            onResult(
                runCatching {
                    val base = apiBase.trimEnd('/')
                    val url = URL("$base/api/chat")
                    val payload =
                        JSONObject()
                            .put("action", "submit")
                            .put("channel", channel)
                            .put("topic", channel)
                            .put("body", body.trim())
                            .put("visitor", UUID.randomUUID().toString())
                            .put("name", name)
                            .toString()
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "POST"
                        connectTimeout = 20_000
                        readTimeout = 30_000
                        doOutput = true
                        setRequestProperty("Content-Type", "application/json; charset=utf-8")
                        setRequestProperty("Accept", "application/json")
                    }
                    try {
                        OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(payload) }
                        val code = conn.responseCode
                        val stream =
                            if (code in 200..299) conn.inputStream else conn.errorStream
                        val text =
                            stream?.let { BufferedReader(InputStreamReader(it, Charsets.UTF_8)).readText() }
                                .orEmpty()
                        if (code !in 200..299) {
                            error("HTTP $code: ${text.take(200)}")
                        }
                    } finally {
                        conn.disconnect()
                    }
                },
            )
        }
    }
}
