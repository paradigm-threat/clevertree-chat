package chat.clevertree.room

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ClevertreeRoomConfigTest {
    @Test
    fun assetUrl_includesApiChannelAndTitle() {
        val url =
            ClevertreeRoomConfig(
                apiBase = "https://intake.myproblem.app/",
                channel = "#mp-general",
                title = "MyProblem",
            ).assetUrl()

        assertTrue(
            url.startsWith(
                "https://appassets.androidplatform.net/assets/clevertree-room/live.html?",
            ),
        )
        assertTrue(url.contains("channel=%23mp-general"))
        assertTrue(url.contains("api=https%3A%2F%2Fintake.myproblem.app"))
        assertTrue(url.contains("title=MyProblem"))
        assertFalse(url.contains("seed"))
    }

    @Test
    fun assetUrl_encodesOptionalFields() {
        val url =
            ClevertreeRoomConfig(
                apiBase = "https://api.clevertree.chat",
                channel = "#web",
                title = "Clevertree",
                collection = "demo-col",
                topic = "2",
                theme = "dark",
                aiOpen = true,
                surface = "side",
            ).assetUrl()

        assertTrue(url.contains("collection=demo-col"))
        assertTrue(url.contains("topic=2"))
        assertTrue(url.contains("theme=dark"))
        assertTrue(url.contains("ai=1"))
        assertTrue(url.contains("surface=side"))
    }

    @Test
    fun assetUrl_ignoresInvalidTheme() {
        val url =
            ClevertreeRoomConfig(
                theme = "neon",
            ).assetUrl()
        assertFalse(url.contains("theme="))
    }

    @Test
    fun assetPath_isStable() {
        assertEquals("clevertree-room/live.html", ClevertreeRoomConfig().assetPath())
    }
}
