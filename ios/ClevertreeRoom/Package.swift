// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "ClevertreeRoom",
    platforms: [
        .iOS(.v15),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "ClevertreeRoom",
            targets: ["ClevertreeRoom"]
        ),
    ],
    targets: [
        .target(
            name: "ClevertreeRoom",
            path: "Sources/ClevertreeRoom",
            resources: [
                .copy("Resources/clevertree-room"),
            ]
        ),
        .testTarget(
            name: "ClevertreeRoomTests",
            dependencies: ["ClevertreeRoom"],
            path: "Tests/ClevertreeRoomTests"
        ),
    ]
)
