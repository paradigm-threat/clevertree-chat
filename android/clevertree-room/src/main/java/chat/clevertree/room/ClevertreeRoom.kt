package chat.clevertree.room

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.PermissionRequest
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader

/**
 * Embeddable Clevertree rich chat room (IRC + SI panel) with media upload/playback
 * and protective covers — same UI as the web room, hosted in a WebView.
 *
 * Host apps should declare CAMERA, RECORD_AUDIO, and INTERNET in their manifest.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ClevertreeRoom(
    config: ClevertreeRoomConfig,
    modifier: Modifier = Modifier,
    onPermissionRequest: ((PermissionRequest) -> Unit)? = null,
) {
    val context = LocalContext.current
    var pendingPermission by remember { mutableStateOf<PermissionRequest?>(null) }
    var fileResultHandler by remember { mutableStateOf<((Array<Uri>?) -> Unit)?>(null) }
    var chromeClient by remember { mutableStateOf<ClevertreeRoomWebChromeClient?>(null) }

    val permissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions(),
        ) { grants ->
            val req = pendingPermission
            pendingPermission = null
            if (req == null) return@rememberLauncherForActivityResult
            val ok =
                grants.values.any { it } ||
                    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                    PackageManager.PERMISSION_GRANTED ||
                    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
                    PackageManager.PERMISSION_GRANTED
            if (ok) {
                req.grant(req.resources)
            } else {
                req.deny()
            }
        }

    val fileChooserLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.StartActivityForResult(),
        ) { result ->
            val handler = fileResultHandler
            fileResultHandler = null
            if (handler == null) {
                chromeClient?.deliverFileChooserResult(null)
                return@rememberLauncherForActivityResult
            }
            val data = result.data
            val uris =
                when {
                    data?.clipData != null -> {
                        val clip = data.clipData!!
                        Array(clip.itemCount) { i -> clip.getItemAt(i).uri }
                    }
                    data?.data != null -> arrayOf(data.data!!)
                    else -> null
                }
            handler(uris)
        }

    val handlePermission: (PermissionRequest) -> Unit =
        onPermissionRequest
            ?: { request ->
                val needCamera =
                    request.resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                val needMic =
                    request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                val missing = mutableListOf<String>()
                if (needCamera &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) !=
                    PackageManager.PERMISSION_GRANTED
                ) {
                    missing += Manifest.permission.CAMERA
                }
                if (needMic &&
                    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
                    PackageManager.PERMISSION_GRANTED
                ) {
                    missing += Manifest.permission.RECORD_AUDIO
                }
                if (missing.isEmpty()) {
                    request.grant(request.resources)
                } else {
                    pendingPermission = request
                    permissionLauncher.launch(missing.toTypedArray())
                }
            }

    val url = remember(config) { config.assetUrl() }

    AndroidView(
        factory = { ctx ->
            val assetLoader =
                WebViewAssetLoader.Builder()
                    .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(ctx))
                    .build()
            WebView(ctx).apply {
                if ((ctx.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
                    WebView.setWebContentsDebuggingEnabled(true)
                }
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                isFocusable = true
                isFocusableInTouchMode = true
                // Claim window focus on touch so soft keyboard can open for <textarea>.
                setOnTouchListener { v, event ->
                    if (event.action == MotionEvent.ACTION_DOWN) {
                        v.requestFocus()
                    }
                    false
                }
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = true
                settings.allowContentAccess = true
                settings.mediaPlaybackRequiresUserGesture = false
                settings.cacheMode = WebSettings.LOAD_DEFAULT
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView?,
                            request: WebResourceRequest,
                        ) = assetLoader.shouldInterceptRequest(request.url)
                    }
                val client =
                    ClevertreeRoomWebChromeClient(
                        onPermissionRequest = handlePermission,
                        onFileChooser = { intent, deliver ->
                            fileResultHandler = deliver
                            try {
                                fileChooserLauncher.launch(intent)
                                true
                            } catch (_: Exception) {
                                fileResultHandler = null
                                false
                            }
                        },
                    )
                chromeClient = client
                webChromeClient = client
                loadUrl(url)
            }
        },
        // Compose owns system-bar/IME insets (WebView listeners often never fire
        // under AndroidView). nav + ime ⇒ room sits above keyboard when it opens.
        modifier =
            modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding(),
        update = { webView ->
            if (webView.url != url) {
                webView.loadUrl(url)
            }
        },
    )
}
