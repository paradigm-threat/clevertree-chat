import XCTest

final class ClevertreeAppSmokeTests: XCTestCase {
    func testHostBundleIdentifier() {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "chat.clevertree.app")
    }
}
