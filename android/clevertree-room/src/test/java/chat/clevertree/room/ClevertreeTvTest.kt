package chat.clevertree.room

import android.view.KeyEvent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ClevertreeTvTest {
    @Test
    fun mediaCommandForKey_mapsTransport() {
        assertEquals(
            "playpause",
            ClevertreeTv.mediaCommandForKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.ACTION_DOWN),
        )
        assertEquals(
            "next",
            ClevertreeTv.mediaCommandForKey(KeyEvent.KEYCODE_MEDIA_NEXT, KeyEvent.ACTION_DOWN),
        )
        assertEquals(
            "prev",
            ClevertreeTv.mediaCommandForKey(KeyEvent.KEYCODE_MEDIA_PREVIOUS, KeyEvent.ACTION_DOWN),
        )
        assertNull(
            ClevertreeTv.mediaCommandForKey(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.ACTION_UP),
        )
        assertNull(ClevertreeTv.mediaCommandForKey(KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.ACTION_DOWN))
    }

    @Test
    fun isVoiceAssistKey() {
        assertTrue(ClevertreeTv.isVoiceAssistKey(KeyEvent.KEYCODE_SEARCH))
        assertTrue(ClevertreeTv.isVoiceAssistKey(KeyEvent.KEYCODE_VOICE_ASSIST))
        assertFalse(ClevertreeTv.isVoiceAssistKey(KeyEvent.KEYCODE_DPAD_CENTER))
    }
}
