import AppKit
import Foundation

@MainActor
extension AgentmonController {
    func previewPixelSnapStrength(_ value: Double) {
        pixelSnapStrength = max(1, min(10, value.rounded()))
        pixelSnapPreviewTouched = true
        refreshPixelSnapPreview()
        if !isApplyingPixelSnap { pixelSnapStatus = "Live preview level \(Int(pixelSnapStrength)) · catalog unchanged" }
    }

    func rebuildPixelSnapCatalog() {
        guard !isApplyingPixelSnap, let node = findNode() else { return }
        let script = URL(fileURLWithPath: projectRoot).appendingPathComponent("plugins/agentmon-codex/scripts/build-trait-visual-pack.mjs").path
        guard FileManager.default.fileExists(atPath: script) else {
            errorText = "Pixel Snap builder was not found in this project."
            return
        }
        let strength = max(1, min(10, Int(pixelSnapStrength.rounded())))
        pixelSnapStrength = Double(strength)
        pixelSnapStatus = "Preparing isolated catalog rebuild at level \(strength)…"
        isApplyingPixelSnap = true
        pixelSnapProgress = 0
        pixelSnapOutputBuffer = ""
        pixelSnapCancellationReason = nil
        pixelSnapLastProgressAt = Date()
        errorText = nil
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [script, "--snap-strength", "\(strength)"]
        if let bundledSharp = Bundle.main.resourceURL?.appendingPathComponent("node_modules/sharp").path,
           FileManager.default.fileExists(atPath: bundledSharp) {
            var environment = ProcessInfo.processInfo.environment
            environment["AGENTMON_SHARP_MODULE"] = bundledSharp
            process.environment = environment
        }
        let standardOutput = Pipe()
        let standardError = Pipe()
        process.standardOutput = standardOutput
        process.standardError = standardError
        standardOutput.fileHandleForReading.readabilityHandler = pixelSnapOutputHandler
        standardError.fileHandleForReading.readabilityHandler = pixelSnapOutputHandler
        process.terminationHandler = { process in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.pixelSnapWatchdog?.invalidate()
                self.pixelSnapWatchdog = nil
                self.visualBuilder = nil
                self.isApplyingPixelSnap = false
                if let reason = self.pixelSnapCancellationReason {
                    self.pixelSnapStatus = reason
                    self.pixelSnapCancellationReason = nil
                } else if process.terminationStatus == 0 {
                    self.pixelSnapProgress = 1
                    self.pixelSnapPreviewTouched = false
                    self.pixelSnapStatus = "Level \(strength) applied to every egg and form"
                    self.renderVisual(trainedAt: "pixel-snap-\(Date().timeIntervalSince1970)")
                } else {
                    self.pixelSnapStatus = "Pixel Snap build failed"
                    self.errorText = "Could not rebuild the visual catalog at level \(strength)."
                }
            }
        }
        do {
            try process.run()
            visualBuilder = process
            pixelSnapWatchdog = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { _ in
                Task { @MainActor [weak self] in self?.checkPixelSnapWorker() }
            }
        } catch {
            isApplyingPixelSnap = false
            pixelSnapStatus = "Pixel Snap build failed"
            errorText = error.localizedDescription
        }
    }

    func cancelPixelSnapCatalogRebuild() {
        guard let process = visualBuilder, process.isRunning else { return }
        if pixelSnapProgress >= 0.99 {
            pixelSnapStatus = "Finishing safe catalog commit…"
            return
        }
        pixelSnapCancellationReason = "Catalog rebuild cancelled · live preview preserved"
        pixelSnapStatus = "Cancelling catalog rebuild…"
        process.terminate()
    }

    func refreshPixelSnapPreview() {
        guard let sourceDisplayImage else { return }
        let strength = max(1, min(10, Int(pixelSnapStrength.rounded())))
        guard strength > 1 else {
            displayImage = sourceDisplayImage
            return
        }
        let sourceSize = sourceDisplayImage.size
        guard sourceSize.width > 0, sourceSize.height > 0 else {
            displayImage = sourceDisplayImage
            return
        }
        let divisor = CGFloat(1 + strength)
        let previewSize = NSSize(width: max(20, floor(sourceSize.width / divisor)), height: max(20, floor(sourceSize.height / divisor)))
        let reduced = NSImage(size: previewSize)
        reduced.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .none
        sourceDisplayImage.draw(in: NSRect(origin: .zero, size: previewSize), from: .zero, operation: .copy, fraction: 1)
        reduced.unlockFocus()
        let snapped = NSImage(size: sourceSize)
        snapped.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .none
        reduced.draw(in: NSRect(origin: .zero, size: sourceSize), from: .zero, operation: .copy, fraction: 1)
        snapped.unlockFocus()
        displayImage = snapped
    }

    private var pixelSnapOutputHandler: @Sendable (FileHandle) -> Void {
        { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in self?.consumePixelSnapOutput(text) }
        }
    }

    private func consumePixelSnapOutput(_ text: String) {
        pixelSnapOutputBuffer += text
        let lines = pixelSnapOutputBuffer.components(separatedBy: .newlines)
        pixelSnapOutputBuffer = lines.last ?? ""
        for line in lines.dropLast() {
            guard line.hasPrefix("AGENTMON_PROGRESS ") else { continue }
            let fields = line.split(separator: " ", maxSplits: 3).map(String.init)
            guard fields.count >= 3, let completed = Double(fields[1]), let total = Double(fields[2]), total > 0 else { continue }
            pixelSnapLastProgressAt = Date()
            pixelSnapProgress = min(1, completed / total)
            let label = fields.count == 4 ? fields[3] : "Rendering"
            pixelSnapStatus = "\(label) · \(Int(pixelSnapProgress * 100))%"
        }
    }

    private func checkPixelSnapWorker() {
        guard let process = visualBuilder, process.isRunning else { return }
        guard pixelSnapProgress < 0.99 else { return }
        guard Date().timeIntervalSince(pixelSnapLastProgressAt) > 120 else { return }
        pixelSnapCancellationReason = "Catalog rebuild stopped safely · no progress for 2 minutes"
        errorText = "Pixel Snap stalled, so Agentmon stopped the isolated worker. Guardot was not changed."
        process.terminate()
    }
}
