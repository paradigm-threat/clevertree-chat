package chat.clevertree.room

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import java.util.Locale

/**
 * On-device speech → text for TV remote / dictate control.
 * Results are delivered as plain transcript strings (composer injection is the host's job).
 */
class ClevertreeDictate(
    private val context: Context,
    private val onResult: (String) -> Unit,
    private val onError: ((String) -> Unit)? = null,
    private val onListening: ((Boolean) -> Unit)? = null,
) {
    private var recognizer: SpeechRecognizer? = null
    private var listening = false

    val isListening: Boolean
        get() = listening

    fun start() {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            onError?.invoke("speech_unavailable")
            return
        }
        stop()
        val sr =
            SpeechRecognizer.createSpeechRecognizer(context).also { recognizer = it }
        sr.setRecognitionListener(
            object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    listening = true
                    onListening?.invoke(true)
                }

                override fun onBeginningOfSpeech() {}

                override fun onRmsChanged(rmsdB: Float) {}

                override fun onBufferReceived(buffer: ByteArray?) {}

                override fun onEndOfSpeech() {
                    listening = false
                    onListening?.invoke(false)
                }

                override fun onError(error: Int) {
                    listening = false
                    onListening?.invoke(false)
                    onError?.invoke("speech_error_$error")
                }

                override fun onResults(results: Bundle?) {
                    listening = false
                    onListening?.invoke(false)
                    val texts =
                        results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    val best = texts?.firstOrNull()?.trim().orEmpty()
                    if (best.isNotEmpty()) onResult(best)
                }

                override fun onPartialResults(partialResults: Bundle?) {}

                override fun onEvent(
                    eventType: Int,
                    params: Bundle?,
                ) {}
            },
        )
        val intent =
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
                )
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            }
        try {
            sr.startListening(intent)
        } catch (e: Exception) {
            listening = false
            onListening?.invoke(false)
            onError?.invoke(e.message ?: "speech_start_failed")
        }
    }

    fun stop() {
        listening = false
        onListening?.invoke(false)
        try {
            recognizer?.stopListening()
        } catch (_: Exception) {
        }
        try {
            recognizer?.cancel()
        } catch (_: Exception) {
        }
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
    }
}
