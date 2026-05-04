import Foundation

#if canImport(EndpointSecurity)
import EndpointSecurity
#endif

struct Probe: Codable {
  let capability: String
  let endpointSecurityAvailable: Bool
  let root: Bool
  let entitlementRequired: String
  let fallback: String
  let eventTypes: [String]
}

let args = Array(CommandLine.arguments.dropFirst())
let command = args.first ?? "probe"

switch command {
case "probe":
  try printJson(probe())
case "simulate":
  let path = value(after: "--event", in: args)
  let event = try readEvent(path: path)
  try printJson(simulate(event))
default:
  try printJson(["error": "Usage: klemm-blocker probe|simulate --event fixture.json"])
}

func probe() -> Probe {
  #if canImport(EndpointSecurity)
  let endpointSecurityAvailable = true
  #else
  let endpointSecurityAvailable = false
  #endif
  let root = getuid() == 0
  let forced = ProcessInfo.processInfo.environment["KLEMM_BLOCKER_FORCE_AVAILABLE"] == "1"
  return Probe(
    capability: forced || (endpointSecurityAvailable && root) ? "available" : "unavailable",
    endpointSecurityAvailable: endpointSecurityAvailable,
    root: root,
    entitlementRequired: "com.apple.developer.endpoint-security.client",
    fallback: "supervised/adapter blocking",
    eventTypes: ["AUTH_EXEC"]
  )
}

func simulate(_ event: [String: String]) -> [String: String] {
  let command = event["command"] ?? ""
  let name = event["processName"] ?? ""
  let value = "\(name) \(command)".lowercased()
  let agentLike = value.contains("codex") || value.contains("claude") || value.contains("cursor") || value.contains("agent")
  let risky = value.contains("git push") || value.contains("deploy") || value.contains("credential") || value.contains("oauth")
  return [
    "event": event["eventType"] ?? "AUTH_EXEC",
    "agentLike": agentLike ? "yes" : "no",
    "decision": agentLike && risky ? "deny" : "allow",
    "reason": agentLike && risky ? "risky agent AUTH_EXEC requires Klemm authority" : "low risk"
  ]
}

func readEvent(path: String?) throws -> [String: String] {
  guard let path else { return [:] }
  let data = try Data(contentsOf: URL(fileURLWithPath: path))
  let object = try JSONSerialization.jsonObject(with: data)
  var event: [String: String] = [:]
  if let dictionary = object as? [String: Any] {
    for (key, value) in dictionary {
      event[key] = "\(value)"
    }
  }
  return event
}

func value(after flag: String, in args: [String]) -> String? {
  guard let index = args.firstIndex(of: flag), index + 1 < args.count else { return nil }
  return args[index + 1]
}

func printJson(_ value: Encodable) throws {
  let data = try JSONEncoder().encode(value)
  FileHandle.standardOutput.write(data)
  FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
