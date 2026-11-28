package chat.clevertree.app

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import chat.clevertree.room.ClevertreeRoom
import chat.clevertree.room.ClevertreeRoomConfig
import chat.clevertree.room.ClevertreeTv

private val CtBg = Color(0xFF0B1210)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Keep adjustResize so IME insets are delivered to the WebView listener.
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        val launchIntent = intent
        setContent {
            ClevertreeApp(launchIntent)
        }
    }
}

/** Intent extras: `channel` (e.g. `#flashback`), `title`, optional `api`, optional `tv`. */
@Composable
private fun ClevertreeApp(intent: Intent?) {
    val context = LocalContext.current
    val config =
        remember(intent) {
            val rawCh =
                intent?.getStringExtra("channel")?.trim()?.takeIf { it.isNotEmpty() }
                    ?: "#flashback"
            val ch = if (rawCh.startsWith("#")) rawCh else "#$rawCh"
            val title =
                intent?.getStringExtra("title")?.trim()?.takeIf { it.isNotEmpty() }
                    ?: "Flashback Repository"
            val api =
                intent?.getStringExtra("api")?.trim()?.takeIf { it.isNotEmpty() }
                    ?: ClevertreeRoomConfig.DEFAULT_API_BASE
            val tvExtra = intent?.getBooleanExtra("tv", false) == true
            val tv = tvExtra || ClevertreeTv.isTelevision(context)
            ClevertreeRoomConfig(
                apiBase = api,
                channel = ch,
                title = title,
                // Open SI rail so movie carousel is visible on TV landscape.
                aiOpen = true,
                tv = tv,
            )
        }
    // Top status bar only here; bottom nav + IME padding is applied on the
    // WebView itself (see ClevertreeRoom) so the page height shrinks correctly.
    ClevertreeRoom(
        config = config,
        modifier =
            Modifier
                .fillMaxSize()
                .background(CtBg)
                .statusBarsPadding(),
    )
}
