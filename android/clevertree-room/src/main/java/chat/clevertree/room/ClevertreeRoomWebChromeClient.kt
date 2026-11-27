package chat.clevertree.room

import android.content.Intent
import android.net.Uri
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView

/**
 * WebChromeClient for mic/camera permission prompts and file attach (gallery / documents).
 */
class ClevertreeRoomWebChromeClient(
    private val onPermissionRequest: (PermissionRequest) -> Unit,
    private val onFileChooser: (Intent, (Array<Uri>?) -> Unit) -> Boolean,
) : WebChromeClient() {
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    override fun onPermissionRequest(request: PermissionRequest?) {
        if (request == null) return
        onPermissionRequest(request)
    }

    override fun onShowFileChooser(
        webView: WebView?,
        filePathCallback: ValueCallback<Array<Uri>>?,
        fileChooserParams: FileChooserParams?,
    ): Boolean {
        this.filePathCallback?.onReceiveValue(null)
        this.filePathCallback = filePathCallback
        val intent =
            try {
                fileChooserParams?.createIntent()
                    ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "*/*"
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                    }
            } catch (_: Exception) {
                Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                }
            }
        val delivered =
            onFileChooser(intent) { uris ->
                deliverFileChooserResult(uris)
            }
        if (!delivered) {
            this.filePathCallback?.onReceiveValue(null)
            this.filePathCallback = null
        }
        return delivered
    }

    /** Call when the host Activity Result returns (or cancel with null). */
    fun deliverFileChooserResult(uris: Array<Uri>?) {
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
    }

    companion object {
        /**
         * Build a chooser Intent suitable for [androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult].
         */
        fun defaultChooserIntent(acceptTypes: Array<String>? = null): Intent {
            return Intent(Intent.ACTION_GET_CONTENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = if (acceptTypes != null && acceptTypes.size == 1) acceptTypes[0] else "*/*"
                if (acceptTypes != null && acceptTypes.size > 1) {
                    putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes)
                }
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
            }
        }
    }
}
