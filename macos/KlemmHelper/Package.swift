// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "KlemmHelper",
  platforms: [.macOS(.v13)],
  products: [
    .executable(name: "klemm-helper", targets: ["KlemmHelper"])
  ],
  targets: [
    .executableTarget(name: "KlemmHelper")
  ]
)
