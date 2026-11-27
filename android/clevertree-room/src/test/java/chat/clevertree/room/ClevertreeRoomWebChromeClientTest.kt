package chat.clevertree.room

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ClevertreeRoomWebChromeClientTest {
    @Test
    fun defaultChooserIntent_allowsMultipleAndOpenable() {
        val intent = ClevertreeRoomWebChromeClient.defaultChooserIntent()
        assertEquals(Intent.ACTION_GET_CONTENT, intent.action)
        assertTrue(intent.categories?.contains(Intent.CATEGORY_OPENABLE) == true)
        assertEquals("*/*", intent.type)
        assertTrue(intent.getBooleanExtra(Intent.EXTRA_ALLOW_MULTIPLE, false))
    }

    @Test
    fun defaultChooserIntent_singleMime() {
        val intent = ClevertreeRoomWebChromeClient.defaultChooserIntent(arrayOf("image/*"))
        assertEquals("image/*", intent.type)
    }
}
