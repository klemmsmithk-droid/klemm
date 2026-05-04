// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "KlemmBlocker",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "klemm-blocker", targets: ["KlemmBlocker"])
  ],
  targets: [
    .executableTarget(name: "KlemmBlocker")
  ]
)
