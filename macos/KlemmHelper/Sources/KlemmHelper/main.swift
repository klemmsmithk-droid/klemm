import Foundation

let args = CommandLine.arguments.dropFirst()
let frontmost = args.drop(while: { $0 != "--frontmost-app" }).dropFirst().first ?? "unknown"

let payload: [String: Any] = [
  "helper": "KlemmHelper",
  "version": "0.1.0",
  "observedAt": ISO8601DateFormatter().string(from: Date()),
  "frontmostApp": frontmost,
  "permissions": [
    "accessibility": "unknown",
    "screenRecording": "unknown",
    "fileEvents": "available"
  ],
  "notes": "Observation helper only; authority remains in the local Klemm daemon."
]

let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
