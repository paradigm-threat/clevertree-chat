import UIKit
import XCTest

final class ClevertreeAppUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testLaunchRoom() {
        let app = launchRoom()
        let room = app.webViews.firstMatch
        XCTAssertTrue(room.buttons["Open menu"].waitForExistence(timeout: 10))
        XCTAssertTrue(room.buttons["Attach file"].exists)
        XCTAssertTrue(room.buttons["Record audio"].exists)
    }

    func testDefaultChannel() {
        let room = launchRoom().webViews.firstMatch
        XCTAssertTrue(room.staticTexts["#web"].waitForExistence(timeout: 10))
    }

    func testComposerStaysAboveKeyboard() {
        let app = launchRoom()
        let room = app.webViews.firstMatch
        let draft = room.textViews["Message to public room"]
        XCTAssertTrue(draft.waitForExistence(timeout: 10))
        draft.tap()
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        draft.typeText("Simulator draft")
        XCTAssertTrue((draft.value as? String)?.contains("Simulator draft") == true)
        XCTAssertTrue(draft.isHittable)
        let send = room.buttons["Send"]
        XCTAssertTrue(send.isHittable)
        XCTAssertLessThanOrEqual(send.frame.maxY, keyboard.frame.minY + 1)
        if room.frame.width <= 500 {
            let transcript = room.descendants(matching: .any)
                .matching(NSPredicate(format: "label BEGINSWITH %@", "Public IRC channel messages"))
                .firstMatch
            XCTAssertTrue(transcript.exists)
            XCTAssertGreaterThanOrEqual(transcript.frame.width, room.frame.width * 0.75)
        }
        attachScreenshot(named: "Composer above keyboard")
        room.staticTexts["Clevertree Chat"].firstMatch.tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: keyboard)
        waitForExpectations(timeout: 8)
        XCTAssertTrue(draft.isHittable)
        attachScreenshot(named: "Keyboard dismissed")
    }

    func testChannelMenuOpens() {
        let room = launchRoom().webViews.firstMatch
        let menu = room.buttons["Open menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 10))
        menu.tap()
        attachScreenshot(named: "Room drawer")
        let switcher = room.descendants(matching: .any).matching(identifier: "List channels").firstMatch
        XCTAssertTrue(switcher.waitForExistence(timeout: 6))
        XCTAssertTrue(switcher.isHittable)
        switcher.tap()
        let list = room.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", "IRC channels")).firstMatch
        let listOrEmptyState = NSPredicate { _, _ in
            list.exists || room.staticTexts["No channels listed"].exists
        }
        expectation(for: listOrEmptyState, evaluatedWith: room)
        waitForExpectations(timeout: 8)
        attachScreenshot(named: "Channel list")

    }

    func testAttachmentPickerOffersPhotoLibrary() {
        let app = launchRoom()
        let attach = app.webViews.firstMatch.buttons["Attach file"]
        XCTAssertTrue(attach.waitForExistence(timeout: 8))
        attach.tap()
        let photoLibrary = app.descendants(matching: .any).matching(identifier: "Photo Library").firstMatch
        XCTAssertTrue(photoLibrary.waitForExistence(timeout: 6))
        attachScreenshot(named: "Attachment picker")
    }

    func testIPadRoomSupportsLandscapeAndPortrait() throws {
        let app = launchRoom()
        guard UIDevice.current.userInterfaceIdiom == .pad else {
            throw XCTSkip("Orientation smoke test runs on iPad.")
        }

        let device = XCUIDevice.shared
        defer { device.orientation = .portrait }
        for orientation in [UIDeviceOrientation.landscapeLeft, .portrait] {
            device.orientation = orientation
            let window = app.windows.firstMatch
            let expectedLandscape = orientation.isLandscape
            let dimensionsMatch = NSPredicate { _, _ in
                (window.frame.width > window.frame.height) == expectedLandscape
            }
            expectation(for: dimensionsMatch, evaluatedWith: window)
            waitForExpectations(timeout: 8)
            XCTAssertTrue(app.webViews.firstMatch.buttons["Open menu"].isHittable)
            attachScreenshot(named: expectedLandscape ? "iPad landscape" : "iPad portrait")
        }
    }

    private func launchRoom() -> XCUIApplication {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 10))
        return app
    }

    private func attachScreenshot(named name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
