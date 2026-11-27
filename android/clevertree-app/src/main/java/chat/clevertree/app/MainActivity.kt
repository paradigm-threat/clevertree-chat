package chat.clevertree.app

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
import chat.clevertree.room.ClevertreeRoom
import chat.clevertree.room.ClevertreeRoomConfig

private val CtBg = Color(0xFF0B1210)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Keep adjustResize so IME insets are delivered to the WebView listener.
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        setContent {
            ClevertreeApp()
        }
    }
}

@Composable
private fun ClevertreeApp() {
    val config =
        remember {
            ClevertreeRoomConfig(
                apiBase = ClevertreeRoomConfig.DEFAULT_API_BASE,
                channel = ClevertreeRoomConfig.UNIVERSAL_CHANNEL, // #web = clevertree.chat/chat
                title = "Clevertree Chat",
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
