import AppKit
import SwiftUI

final class AgentmonAppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillTerminate(_ notification: Notification) {
        AgentmonController.shared.shutdown()
    }
}

@main
struct AgentmonDesktopApp: App {
    @NSApplicationDelegateAdaptor(AgentmonAppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup { AgentmonDesktopView() }
            .windowStyle(.hiddenTitleBar)
            .defaultSize(width: 900, height: 760)
    }
}
