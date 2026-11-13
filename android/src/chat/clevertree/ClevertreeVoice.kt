package chat.clevertree

/**
 * Embeddable voice front for other apps.
 * Speech becomes text. This component does not write git and does not keep a second copy
 * of the visitor, the comment, or the vote. An empty page stays empty until they talk.
 */
interface FilingApi {
    fun fileTranscript(visitorUuid: String, pageUrl: String, transcript: String): FiledText
    fun sectionAudio(sectionKey: String): AudioClip
}

data class FiledText(val key: String, val canOverride: Boolean, val body: String)

data class AudioClip(val sectionKey: String, val mime: String)

class ClevertreeVoice(private val api: FilingApi) {
    fun onTranscript(visitorUuid: String, pageUrl: String, transcript: String): FiledText {
        val text = transcript.trim()
        if (text.isEmpty()) error("Empty until they talk")
        return api.fileTranscript(visitorUuid, pageUrl, text)
    }

    fun hearSection(sectionKey: String): AudioClip {
        return api.sectionAudio(sectionKey)
    }
}
