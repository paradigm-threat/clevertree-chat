import XCTest
@testable import ClevertreeRoom

final class ClevertreeRoomConfigTests: XCTestCase {
    func testAssetUrlIncludesApiChannelAndTitle() {
        let url = ClevertreeRoomConfig(
            apiBase: "https://intake.myproblem.app/",
            channel: "#mp-general",
            title: "MyProblem"
        ).assetUrl()

        XCTAssertTrue(
            url.hasPrefix(
                "clevertree-room://appassets.clevertree.local/clevertree-room/live.html?"
            )
        )
        XCTAssertTrue(url.contains("channel=%23mp-general"))
        XCTAssertTrue(url.contains("api=https://intake.myproblem.app") || url.contains("api=https%3A%2F%2Fintake.myproblem.app"))
        XCTAssertTrue(url.contains("title=MyProblem"))
        XCTAssertFalse(url.contains("seed"))
    }

    func testAssetUrlEncodesOptionalFields() {
        let url = ClevertreeRoomConfig(
            apiBase: "https://api.clevertree.chat",
            channel: "#web",
            title: "Clevertree",
            collection: "demo-col",
            topic: "2",
            theme: "dark",
            aiOpen: true,
            surface: "side"
        ).assetUrl()

        XCTAssertTrue(url.contains("collection=demo-col"))
        XCTAssertTrue(url.contains("topic=2"))
        XCTAssertTrue(url.contains("theme=dark"))
        XCTAssertTrue(url.contains("ai=1"))
        XCTAssertTrue(url.contains("surface=side"))
    }

    func testAssetUrlIgnoresInvalidTheme() {
        let url = ClevertreeRoomConfig(theme: "neon").assetUrl()
        XCTAssertFalse(url.contains("theme="))
    }

    func testAssetPathIsStable() {
        XCTAssertEqual(ClevertreeRoomConfig().assetPath(), "clevertree-room/live.html")
    }

    func testDefaultChannelIsUniversalWeb() {
        XCTAssertEqual(ClevertreeRoomConfig.defaultChannel, "#web")
        XCTAssertEqual(ClevertreeRoomConfig.universalChannel, "#web")
    }
}
