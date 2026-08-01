import Foundation

/// Reports volume capacity the same way macOS Settings / Finder do.
/// - importantBytes: free space for user files (includes purgeable space)
/// - immediateBytes: free space without purging (what df/statfs report)
///
/// Usage: macos-disk-free [path]
/// Prints one JSON object to stdout.

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/"
let url = URL(fileURLWithPath: path)

guard let v = try? url.resourceValues(forKeys: [
  .volumeTotalCapacityKey,
  .volumeAvailableCapacityKey,
  .volumeAvailableCapacityForImportantUsageKey,
]) else {
  fputs("failed to read volume capacity for \(path)\n", stderr)
  exit(1)
}

let total = v.volumeTotalCapacity ?? 0
let immediate = v.volumeAvailableCapacity ?? 0
// Important usage can be nil on some volumes; fall back to immediate free.
let important = v.volumeAvailableCapacityForImportantUsage.map { Int($0) } ?? immediate

print("{\"totalBytes\":\(total),\"immediateBytes\":\(immediate),\"importantBytes\":\(important)}")
