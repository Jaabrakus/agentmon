import SwiftUI

extension AgentmonDesktopView {
    private func compactRoot(_ root: String) -> String {
        guard root.count > 18 else { return root }
        return "\(root.prefix(10))…\(root.suffix(8))"
    }

    var marketplacePanel: some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("MARKETPLACE · VERIFIED AGENTMON ECONOMY").font(.system(size: 11, weight: .black, design: .monospaced)).foregroundStyle(.yellow)
                    Text("The market lives here. The website supplies account pairing and the authority registry; Chrome never receives market credentials.").font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary)
                }
                Spacer()
                StatusPill(text: controller.marketplaceStatus, active: controller.marketplaceStatus == "verified")
                StatusPill(text: controller.marketplaceAuthorityOnline ? "Authority Online" : "Authority Offline", active: controller.marketplaceAuthorityOnline)
            }

            if !controller.marketplacePaired {
                HStack(spacing: 8) {
                    Button("1 · OPEN PAIRING WEBSITE") { controller.openMarketplacePairingWebsite() }
                    SecureField("2 · Paste the one-time device token", text: $controller.marketplacePairToken).textFieldStyle(.roundedBorder)
                    Button(controller.isMarketplaceBusy ? "PAIRING…" : "3 · CONNECT") { controller.pairMarketplace() }
                        .buttonStyle(.borderedProminent).tint(.yellow)
                        .disabled(controller.isMarketplaceBusy || controller.marketplacePairToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !controller.isRunning)
                }.buttonStyle(.bordered)
                Text("The token is revocable and scoped to registry actions. It is stored locally with owner-only file permissions; ownership private keys and raw prompts never leave the device.")
                    .font(.system(size: 8, design: .monospaced)).foregroundStyle(.secondary)
            } else {
                HStack(spacing: 8) {
                    AgentmonMetric(label: "LOCAL STATE ROOT", value: compactRoot(controller.marketplaceStateRoot))
                    AgentmonMetric(label: "AUTHORITY HEAD", value: compactRoot(controller.marketplaceHeadRoot))
                    AgentmonMetric(label: "TRANSITION", value: "#\(controller.marketplaceTransitionSequence)")
                    AgentmonMetric(label: "ACTIVE CARDS", value: "\(controller.marketplaceListings.count)")
                }
                HStack(spacing: 8) {
                    Button("REFRESH") { controller.refreshMarketplace() }
                    Button(controller.isMarketplaceBusy ? "VERIFYING…" : "VERIFY CURRENT STATE") { controller.verifyMarketplaceState() }
                        .disabled(controller.isMarketplaceBusy || controller.marketplaceStatus == "modded")
                    if controller.marketplaceOwnListingId == nil {
                        Button("LIST FOR 72 HOURS") { controller.listOnMarketplace() }
                            .buttonStyle(.borderedProminent).tint(.yellow)
                            .disabled(controller.isMarketplaceBusy || controller.marketplaceStatus != "verified" || controller.marketplaceHeadRoot != controller.marketplaceStateRoot)
                    } else {
                        Button("CANCEL MY LISTING") { controller.cancelMarketplaceListing() }
                            .buttonStyle(.borderedProminent).tint(.red)
                            .disabled(controller.isMarketplaceBusy)
                    }
                    Spacer()
                    Button("OPEN ACCOUNT SITE") { controller.openMarketplacePairingWebsite() }
                }.buttonStyle(.bordered)

                if controller.marketplaceListings.isEmpty {
                    Text("No verified Agentmons are listed yet. The first legitimate card can be yours.")
                        .font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
                        .padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.25)).clipShape(RoundedRectangle(cornerRadius: 9))
                } else {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 10) {
                            ForEach(controller.marketplaceListings) { listing in
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(listing.species.uppercased()).font(.system(size: 11, weight: .black, design: .monospaced)).foregroundStyle(.yellow)
                                    Text(listing.agentmonId).font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(.mint)
                                    Text(compactRoot(listing.stateRoot)).font(.system(size: 8, design: .monospaced)).foregroundStyle(.secondary)
                                    Text(listing.owned ? "YOUR VERIFIED CARD" : "VERIFIED LISTING").font(.system(size: 8, weight: .black, design: .monospaced)).foregroundStyle(listing.owned ? .cyan : .white)
                                }
                                .padding(12).frame(width: 190, alignment: .leading)
                                .background(LinearGradient(colors: [Color.purple.opacity(0.25), Color.black.opacity(0.35)], startPoint: .topLeading, endPoint: .bottomTrailing))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.yellow.opacity(0.35))).clipShape(RoundedRectangle(cornerRadius: 10))
                            }
                        }
                    }
                }
            }
            Text(controller.marketplaceMessage).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(controller.marketplaceStatus == "modded" ? .red : .yellow)
        }
        .padding(16).background(Color.white.opacity(0.035)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.yellow.opacity(0.25))).clipShape(RoundedRectangle(cornerRadius: 14))
    }

    var localModelPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("LOCAL AGENT RUNTIME · DEVICE-ONLY CHAT").font(.system(size: 11, weight: .black, design: .monospaced)).foregroundStyle(.mint)
                    Text("Auto-detect local runtimes or enter any loopback OpenAI-compatible endpoint. Agentmon refuses remote endpoints.").font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary)
                }
                Spacer()
                StatusPill(text: controller.localModelConnected ? "Local Model Connected" : "Local Model Offline", active: controller.localModelConnected)
            }
            HStack(spacing: 8) {
                Button("AUTO-DETECT") { controller.autoDetectLocalAgents() }
                Button("SCAN OLLAMA") { controller.chooseLocalModelServer("ollama") }
                Button("SCAN LM STUDIO") { controller.chooseLocalModelServer("lm-studio") }
                TextField("Loopback OpenAI-compatible URL", text: $controller.localModelEndpoint).textFieldStyle(.roundedBorder)
                Button("SCAN") { controller.scanLocalModels() }.disabled(controller.isLocalModelBusy)
            }.buttonStyle(.bordered)
            HStack(spacing: 8) {
                Picker(controller.localRuntimeName.uppercased(), selection: $controller.selectedLocalModel) {
                    if controller.localModelChoices.isEmpty { Text("No loaded models found").tag("") }
                    else { ForEach(controller.localModelChoices, id: \.self) { model in Text(model).tag(model) } }
                }.pickerStyle(.menu).frame(maxWidth: .infinity)
                Button(controller.localModelConnected ? "CONNECTED" : "USE THIS LOCAL MODEL") { controller.connectLocalModel() }
                    .buttonStyle(.borderedProminent).tint(.mint)
                    .disabled(controller.selectedLocalModel.isEmpty || controller.isLocalModelBusy || controller.localModelConnected)
            }
            Text(controller.localModelStatus).font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(controller.localModelConnected ? .mint : .secondary)
            if controller.localModelConnected {
                Divider()
                Text("PRIVATE LOCAL TEST · AGENTMON ROUTES ONLY PROVEN SKILLS").font(.system(size: 9, weight: .black, design: .monospaced)).foregroundStyle(.cyan)
                TextEditor(text: $controller.localChatPrompt).font(.system(size: 11, design: .monospaced)).frame(minHeight: 64).padding(6).background(Color.black.opacity(0.3)).clipShape(RoundedRectangle(cornerRadius: 8))
                HStack {
                    Text("Agentmon stores neither side of this exchange. Your local model application's own retention settings still apply.").font(.system(size: 8, design: .monospaced)).foregroundStyle(.secondary)
                    Spacer()
                    Button(controller.isLocalModelBusy ? "THINKING LOCALLY…" : "ASK LOCALLY WITH AGENTMON") { controller.sendLocalChat() }
                        .buttonStyle(.borderedProminent).tint(.purple)
                        .disabled(controller.isLocalModelBusy || controller.localChatPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                if !controller.localChatResponse.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        if !controller.localChatAgentmon.isEmpty { Text(controller.localChatAgentmon.uppercased()).font(.system(size: 8, weight: .black, design: .monospaced)).foregroundStyle(.mint) }
                        Text(controller.localChatResponse).font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                    }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(Color.black.opacity(0.3)).clipShape(RoundedRectangle(cornerRadius: 9))
                }
            }
        }.padding(16).background(Color.white.opacity(0.035)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.mint.opacity(0.22))).clipShape(RoundedRectangle(cornerRadius: 14))
    }

    var privacyBar: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("RAW BROWSER PROMPTS: MEMORY ONLY", systemImage: "lock.shield.fill").foregroundStyle(.mint)
                Spacer()
                Text("NO VAULT · NO SQLITE · NO AGENTMON CLOUD").foregroundStyle(.secondary)
            }.font(.system(size: 10, weight: .bold, design: .monospaced))
            if controller.legacyFeedDetected {
                Label("Legacy .agentmon/feeds/main.json still exists. The browser path is raw-free, but remove that old file before calling the whole project raw-free.", systemImage: "exclamationmark.triangle.fill")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced)).foregroundStyle(.orange)
            }
        }.padding(14).background(Color.black.opacity(0.25)).clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
