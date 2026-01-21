// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "webauto-ocr-macos",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .executable(name: "webauto-ocr-macos", targets: ["webauto-ocr-macos"]),
  ],
  targets: [
    .executableTarget(
      name: "webauto-ocr-macos",
      path: "Sources"
    ),
  ]
)

