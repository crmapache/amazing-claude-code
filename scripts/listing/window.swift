import CoreGraphics
import Foundation

// Prints "<window id> <owner pid>" of the first normal window whose title contains the argument.
//
// The IDE frames are captured by window id (`screencapture -l`), never by a region of the screen: a region
// takes whatever is in front of it at that moment, and on a working machine that is somebody's messenger.
let needle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []

for window in windows {
  let title = window[kCGWindowName as String] as? String ?? ""
  let layer = window[kCGWindowLayer as String] as? Int ?? 0
  guard layer == 0, title.contains(needle) else { continue }
  let id = window[kCGWindowNumber as String] as? Int ?? 0
  let pid = window[kCGWindowOwnerPID as String] as? Int ?? 0
  print("\(id) \(pid)")
  exit(0)
}

exit(1)
