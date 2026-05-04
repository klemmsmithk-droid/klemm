import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

struct Options {
  var missionId: String?
  var daemonUrl: String?
  var daemonToken: String?
  var frontmostAppOverride: String?
  var processFixture: String?
  var watchPaths: [String] = []
  var stream = false
  var count = 1
  var intervalMs = 2_000
}

let options = parseOptions(Array(CommandLine.arguments.dropFirst()))

if options.stream {
  for index in 0..<max(options.count, 1) {
    let payload = snapshot(options)
    if let daemonUrl = options.daemonUrl {
      try postSnapshot(payload, to: daemonUrl, token: options.daemonToken)
    } else {
      try writeJson(payload)
    }
    if index < max(options.count, 1) - 1 {
      Thread.sleep(forTimeInterval: Double(options.intervalMs) / 1000.0)
    }
  }
} else {
  let payload = snapshot(options)
  if let daemonUrl = options.daemonUrl {
    try postSnapshot(payload, to: daemonUrl, token: options.daemonToken)
  }
  try writeJson(payload)
}

func parseOptions(_ args: [String]) -> Options {
  var options = Options()
  var index = 0
  while index < args.count {
    let value = args[index]
    func next() -> String? {
      guard index + 1 < args.count else { return nil }
      index += 1
      return args[index]
    }
    switch value {
    case "stream", "--stream":
      options.stream = true
    case "snapshot", "--once":
      options.stream = false
    case "--mission":
      options.missionId = next()
    case "--daemon-url":
      options.daemonUrl = next()
    case "--token":
      options.daemonToken = next()
    case "--frontmost-app":
      options.frontmostAppOverride = next()
    case "--process-fixture":
      options.processFixture = next()
    case "--watch-path":
      if let path = next() { options.watchPaths.append(path) }
    case "--count":
      options.count = Int(next() ?? "") ?? options.count
    case "--interval-ms":
      options.intervalMs = Int(next() ?? "") ?? options.intervalMs
    default:
      break
    }
    index += 1
  }
  return options
}

func snapshot(_ options: Options) -> [String: Any] {
  let runningApps = collectRunningApps(frontmostOverride: options.frontmostAppOverride)
  let frontmost = options.frontmostAppOverride
    ?? runningApps.first(where: { ($0["frontmost"] as? Bool) == true })?["name"] as? String
    ?? "unknown"
  let processes = collectProcesses(fixturePath: options.processFixture)
  return [
    "helper": "KlemmHelper",
    "version": "0.2.0",
    "source": "macos-helper-v2",
    "missionId": options.missionId as Any,
    "observedAt": ISO8601DateFormatter().string(from: Date()),
    "platform": "darwin",
    "frontmostApp": frontmost,
    "appActivity": ["frontmostApp": frontmost],
    "runningApps": runningApps,
    "processes": processes,
    "processCount": processes.count,
    "permissions": collectPermissions(),
    "fileWatchMetadata": options.watchPaths.map { ["path": $0, "mode": "metadata", "status": "configured"] },
    "fileEvents": options.watchPaths.map { ["path": $0, "event": "watch_configured"] },
    "unmanagedAgentHints": processes.compactMap(agentHint),
    "notes": "Observation helper only; authority remains in the local Klemm daemon."
  ]
}

func collectRunningApps(frontmostOverride: String?) -> [[String: Any]] {
  let apps = NSWorkspace.shared.runningApplications.map { app in
    [
      "pid": app.processIdentifier,
      "name": app.localizedName ?? app.bundleIdentifier ?? "unknown",
      "bundleIdentifier": app.bundleIdentifier ?? "",
      "frontmost": app.isActive
    ] as [String: Any]
  }
  if let override = frontmostOverride, !apps.contains(where: { ($0["name"] as? String) == override }) {
    return [["pid": 0, "name": override, "bundleIdentifier": "override", "frontmost": true]] + apps
  }
  return apps
}

func collectProcesses(fixturePath: String?) -> [[String: Any]] {
  let text: String
  if let fixturePath {
    text = (try? String(contentsOfFile: fixturePath, encoding: .utf8)) ?? ""
  } else {
    let process = Process()
    let pipe = Pipe()
    process.executableURL = URL(fileURLWithPath: "/bin/ps")
    process.arguments = ["-axo", "pid=,comm=,command="]
    process.standardOutput = pipe
    do {
      try process.run()
      process.waitUntilExit()
      text = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
    } catch {
      text = ""
    }
  }
  return parseProcessTable(text)
}

func parseProcessTable(_ text: String) -> [[String: Any]] {
  text
    .split(separator: "\n")
    .compactMap { line -> [String: Any]? in
      let trimmed = line.trimmingCharacters(in: .whitespaces)
      if trimmed.lowercased().hasPrefix("pid ") || trimmed.isEmpty { return nil }
      let pieces = trimmed.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: true)
      guard pieces.count == 3, let pid = Int(pieces[0]) else { return nil }
      return ["pid": pid, "name": String(pieces[1]), "command": String(pieces[2])]
    }
}

func collectPermissions() -> [String: String] {
  [
    "accessibility": AXIsProcessTrusted() ? "granted" : "not_granted",
    "screenRecording": CGPreflightScreenCaptureAccess() ? "granted" : "not_granted",
    "fileEvents": "available"
  ]
}

func agentHint(_ process: [String: Any]) -> [String: Any]? {
  let value = "\(process["name"] ?? "") \(process["command"] ?? "")".lowercased()
  let kind: String
  if value.contains("claude") {
    kind = "claude"
  } else if value.contains("cursor") {
    kind = "cursor"
  } else if value.contains("browser-agent") {
    kind = "browser"
  } else if value.contains("mcp-agent") {
    kind = "mcp"
  } else if value.contains("shell-agent") {
    kind = "shell"
  } else if value.contains("codex") {
    kind = "codex"
  } else if value.contains("agent") {
    kind = "agent"
  } else {
    return nil
  }
  return [
    "pid": process["pid"] ?? 0,
    "agentKind": kind,
    "command": process["command"] ?? "",
    "reason": "agent-like process observed by KlemmHelper"
  ]
}

func postSnapshot(_ payload: [String: Any], to daemonUrl: String, token: String?) throws {
  guard let url = URL(string: daemonUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/api/os/observations") else {
    throw NSError(domain: "KlemmHelper", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid daemon URL"])
  }
  var request = URLRequest(url: url)
  request.httpMethod = "POST"
  request.setValue("application/json", forHTTPHeaderField: "content-type")
  if let token, !token.isEmpty {
    request.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
  }
  request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
  let semaphore = DispatchSemaphore(value: 0)
  var requestError: Error?
  URLSession.shared.dataTask(with: request) { _, response, error in
    if let error {
      requestError = error
    } else if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
      requestError = NSError(domain: "KlemmHelper", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: "Daemon rejected snapshot with HTTP \(http.statusCode)"])
    }
    semaphore.signal()
  }.resume()
  semaphore.wait()
  if let requestError { throw requestError }
}

func writeJson(_ payload: [String: Any]) throws {
  let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
