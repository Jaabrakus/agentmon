# Windows installer

The Windows x64 `.exe` and `.msi` are native artifacts and must be built on a Windows GitHub runner. Push the `agentmon-v0.19.0` tag or run **Agentmon Desktop Release** from the Actions tab; the workflow attaches both installers to the GitHub Release after all desktop and engine tests pass.

This notice prevents a macOS binary from being mislabeled as a Windows download. Replace it only with the real workflow-produced installer.
