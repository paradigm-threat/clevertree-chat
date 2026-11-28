package chat.clevertree.room

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.JavascriptInterface
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

/**
 * Embeddable Clevertree rich chat room (IRC + SI panel) with media upload/playback
 * and protective covers — same UI as the web room, hosted in a WebView.
 *
 * Host apps should declare CAMERA, RECORD_AUDIO, and INTERNET in their manifest.
 * On Android TV (`config.tv` or auto-detected), enables D-pad focus + dictate bridge.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun ClevertreeRoom(
    config: ClevertreeRoomConfig,
    modifier: Modifier = Modifier,
    onPermissionRequest: ((PermissionRequest) -> Unit)? = null,
) {
    val context = LocalContext.current
    val tvMode = config.tv || ClevertreeTv.isTelevision(context)
    val effectiveConfig = remember(config, tvMode) { if (tvMode && !config.tv) config.copy(tv = true) else config }

    var pendingPermission by remember { mutableStateOf<PermissionRequest?>(null) }
    var fileResultHandler by remember { mutableStateOf<((Array<Uri>?) -> Unit)?>(null) }
    var chromeClient by remember { mutableStateOf<ClevertreeRoomWebChromeClient?>(null) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var dictate by remember { mutableStateOf<ClevertreeDictate?>(null) }

    val mainHandler = remember { Handler(Looper.getMainLooper()) }

    fun injectTranscript(text: String) {
        val wv = webViewRef ?: return
        val payload = JSONObject.quote(text)
        wv.evaluateJavascript(
            "(function(){try{if(window.CleverTreeRoom&&typeof CleverTreeRoom.tvInjectTranscript==='function')" +
                "{CleverTreeRoom.tvInjectTranscript($payload);}}" +
                "catch(e){}})();",
            null,
        )
    }

    fun runMediaCommand(cmd: String) {
        val wv = webViewRef ?: return
        val payload = JSONObject.quote(cmd)
        wv.evaluateJavascript(
            "(function(){try{if(window.CleverTreeRoom&&typeof CleverTreeRoom.tvMediaCommand==='function')" +
                "{CleverTreeRoom.tvMediaCommand($payload);}}" +
                "catch(e){}})();",
            null,
        )
    }

    fun ensureDictate(): ClevertreeDictate {
        dictate?.let { return it }
        val d =
            ClevertreeDictate(
                context = context.applicationContext,
                onResult = { text -> mainHandler.post { injectTranscript(text) } },
                onError = { /* soft-fail; UI stays usable */ },
            )
        dictate = d
        return d
    }

    fun startDictateFlow() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }
        ensureDictate().start()
    }

    val permissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestMultiplePermissions(),
        ) { grants ->
            val req = pendingPermission
            pendingPermission = null
            if (req == null) {
                if (grants[Manifest.permission.RECORD_AUDIO] == true && tvMode) {
                    startDictateFlow()
                }
                return@rememberLauncherForActivityResult
            }
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

    val dictatePermissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted ->
            if (granted) startDictateFlow()
        }

    fun requestDictate() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED
        ) {
            startDictateFlow()
        } else {
            dictatePermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
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

    val url = remember(effectiveConfig) { effectiveConfig.assetUrl() }

    DisposableEffect(Unit) {
        onDispose {
            dictate?.stop()
            dictate = null
        }
    }

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
                descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS
                setOnTouchListener { v, event ->
                    if (event.action == MotionEvent.ACTION_DOWN) {
                        v.requestFocus()
                    }
                    false
                }
                setOnKeyListener { _, keyCode, event ->
                    if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
                    val media = ClevertreeTv.mediaCommandForKey(keyCode, event.action)
                    if (media != null) {
                        runMediaCommand(media)
                        return@setOnKeyListener true
                    }
                    if (tvMode && ClevertreeTv.isVoiceAssistKey(keyCode)) {
                        requestDictate()
                        return@setOnKeyListener true
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
                addJavascriptInterface(
                    object {
                        @JavascriptInterface
                        fun startDictate() {
                            mainHandler.post { requestDictate() }
                        }

                        @JavascriptInterface
                        fun stopDictate() {
                            mainHandler.post { dictate?.stop() }
                        }

                        @JavascriptInterface
                        fun isTv(): Boolean = tvMode
                    },
                    "AndroidRoom",
                )
                webViewClient =
                    object : WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView?,
                            request: WebResourceRequest,
                        ) = assetLoader.shouldInterceptRequest(request.url)

                        override fun onPageFinished(
                            view: WebView?,
                            finishedUrl: String?,
                        ) {
                            super.onPageFinished(view, finishedUrl)
                            view?.post {
                                view.requestFocus()
                                if (tvMode) {
                                    view.evaluateJavascript(
                                        "(function(){try{if(window.CleverTreeRoom&&typeof CleverTreeRoom.tvBoot==='function')" +
                                            "{CleverTreeRoom.tvBoot();}}catch(e){}})();",
                                        null,
                                    )
                                }
                            }
                        }
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
                webViewRef = this
                loadUrl(url)
                if (tvMode) {
                    post { requestFocus() }
                }
            }
        },
        modifier =
            modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding(),
        update = { webView ->
            webViewRef = webView
            if (webView.url != url) {
                webView.loadUrl(url)
            }
        },
    )
}
