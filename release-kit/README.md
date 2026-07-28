# Agentmon release kit

Use [latest](./latest/) for the friend-ready app and browser companion. Historical release folders can live beside it without changing the link shared in the repository README.

Desktop installers are produced by [the Agentmon release workflow](../.github/workflows/agentmon-desktop-release.yml):

- macOS Apple Silicon `.app` bundle
- Windows x64 NSIS setup `.exe`
- Windows x64 `.msi`
- Chrome companion extension ZIP
- quick-start guide

To create the GitHub downloads for the version in `agentmon-native-prototype/package.json`:

```sh
git tag agentmon-v0.19.0
git push origin agentmon-v0.19.0
```

The workflow can also be started manually from the GitHub Actions tab.
