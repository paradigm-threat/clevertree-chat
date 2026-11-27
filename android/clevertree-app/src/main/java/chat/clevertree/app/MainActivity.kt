package chat.clevertree.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import chat.clevertree.room.ClevertreeRoom
import chat.clevertree.room.ClevertreeRoomConfig

private val CtBg = Color(0xFF0B1210)
private val CtAccent = Color(0xFF5FD4A4)
private val CtOnAccent = Color(0xFF0B1210)
private val CtText = Color(0xFFE8EEF6)
private val CtMuted = Color(0xFFA0B0C4)
private val CtField = Color(0xFF15201C)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ClevertreeApp()
        }
    }
}

private enum class AppPhase {
    Onboarding,
    Room,
}

@Composable
private fun ClevertreeApp() {
    val prefs =
        LocalContext.current.getSharedPreferences("clevertree_app", 0)
    var phase by remember {
        mutableStateOf(
            if (prefs.getBoolean("onboarded", false)) AppPhase.Room else AppPhase.Onboarding,
        )
    }
    val config =
        remember {
            ClevertreeRoomConfig(
                apiBase = ClevertreeRoomConfig.DEFAULT_API_BASE,
                channel = ClevertreeRoomConfig.UNIVERSAL_CHANNEL,
                title = "Clevertree",
            )
        }

    when (phase) {
        AppPhase.Onboarding ->
            OnboardingScreen(
                config = config,
                onEnteredRoom = {
                    prefs.edit().putBoolean("onboarded", true).apply()
                    phase = AppPhase.Room
                },
            )
        AppPhase.Room ->
            FullRoomScreen(config = config)
    }
}

@Composable
private fun OnboardingScreen(
    config: ClevertreeRoomConfig,
    onEnteredRoom: () -> Unit,
) {
    var draft by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val mainHandler = remember { android.os.Handler(android.os.Looper.getMainLooper()) }

    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(CtBg)
                .statusBarsPadding()
                .navigationBarsPadding()
                .imePadding(),
    ) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text(
                stringResource(R.string.onboard_eyebrow),
                color = CtAccent,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Clevertree Chat",
                color = CtText,
                fontSize = 22.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                stringResource(R.string.onboard_lead),
                color = CtMuted,
                fontSize = 14.sp,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        ClevertreeRoom(
            config = config,
            modifier =
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(horizontal = 8.dp),
        )

        Column(
            modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = {
                    draft = it
                    error = null
                },
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 96.dp),
                placeholder = { Text(stringResource(R.string.onboard_hint), color = CtMuted) },
                colors =
                    OutlinedTextFieldDefaults.colors(
                        focusedTextColor = CtText,
                        unfocusedTextColor = CtText,
                        focusedContainerColor = CtField,
                        unfocusedContainerColor = CtField,
                        cursorColor = CtAccent,
                        focusedBorderColor = CtAccent,
                        unfocusedBorderColor = CtMuted.copy(alpha = 0.4f),
                    ),
                shape = RoundedCornerShape(12.dp),
                enabled = !busy,
                maxLines = 6,
            )
            if (error != null) {
                Text(error!!, color = Color(0xFFFF8F8F), fontSize = 13.sp)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OutlinedButton(
                    onClick = onEnteredRoom,
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    colors =
                        ButtonDefaults.outlinedButtonColors(contentColor = CtMuted),
                ) {
                    Text(stringResource(R.string.onboard_skip))
                }
                Button(
                    onClick = {
                        val body = draft.trim()
                        if (body.isEmpty()) {
                            error = "Type a question first."
                            return@Button
                        }
                        busy = true
                        error = null
                        ChatSubmit.post(
                            apiBase = config.apiBase,
                            channel = config.channel,
                            body = body,
                        ) { result ->
                            mainHandler.post {
                                busy = false
                                result
                                    .onSuccess { onEnteredRoom() }
                                    .onFailure {
                                        error =
                                            it.message?.take(120)
                                                ?: "Could not post. Check network and try again."
                                    }
                            }
                        }
                    },
                    enabled = !busy,
                    modifier = Modifier.weight(1f),
                    colors =
                        ButtonDefaults.buttonColors(
                            containerColor = CtAccent,
                            contentColor = CtOnAccent,
                        ),
                ) {
                    if (busy) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(4.dp),
                            color = CtOnAccent,
                            strokeWidth = 2.dp,
                        )
                    } else {
                        Text(stringResource(R.string.onboard_submit))
                    }
                }
            }
        }
    }
}

@Composable
private fun FullRoomScreen(config: ClevertreeRoomConfig) {
    Column(
        modifier =
            Modifier
                .fillMaxSize()
                .background(CtBg)
                .statusBarsPadding()
                .navigationBarsPadding(),
    ) {
        Text(
            "Clevertree · ${config.channel}",
            color = CtAccent,
            fontWeight = FontWeight.SemiBold,
            fontSize = 16.sp,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
        )
        ClevertreeRoom(
            config = config,
            modifier =
                Modifier
                    .weight(1f)
                    .fillMaxWidth(),
        )
    }
}
