# DeFlood Guardian Desktop Companion

DeFlood Guardian is a small Electron launcher for the existing DeFlood.AI website. It does not contain flood-risk calculations, environmental requests, planning logic, or a second chatbot.

## Run locally

From the repository root:

```sh
pnpm guardian:dev
```

The development fallback opens `http://localhost:8443`. Set the public website URL without changing the desktop code:

```sh
DEFLOOD_APP_URL=https://your-published-deflood-site.example pnpm guardian:dev
```

Only a public `http` or `https` DeFlood website URL is accepted. Do not put Worker secrets, webhook URLs, n8n addresses, or tokens in this setting.

## Verify and package locally

```sh
pnpm guardian:test
pnpm guardian:typecheck
pnpm guardian:build
pnpm guardian:pack
```

`pnpm guardian:pack` creates an unpacked local application in `desktop/deflood-guardian/release`. Open the generated `DeFlood Guardian.app` once so macOS Launch Services sees the registered `defloodguardian` URL scheme. After that, the website's **Launch Guardian** control sends `defloodguardian://show` to the packaged companion. No App Store, notarization, or paid certificate is required for this local prototype.

The allowlisted protocol commands are:

- `defloodguardian://show` — show the one existing Guardian window without resetting its saved position
- `defloodguardian://ask` — show Guardian and open the existing Ask DeFlood.AI destination
- `defloodguardian://open` — show Guardian and open the existing DeFlood website

Unknown commands, paths, query strings, fragments, credentials, and arbitrary URL schemes are ignored.

## Windows packaging

On Windows, build the unsigned NSIS installer with:

```sh
pnpm --dir desktop/deflood-guardian dist:win
```

Install and launch it once, then use `defloodguardian://show`. The NSIS installer is the supported local prototype route because it gives the executable a stable installed path and registers the scheme through package metadata. A portable artifact can still be built with `pnpm --dir desktop/deflood-guardian dist:win:portable`, but a portable executable can unpack to a temporary path, so persistent custom-protocol launching is not promised for that format. Windows protocol behavior is prepared in code but has not been verified on this Mac.

These commands use free local tooling. External distribution of unsigned builds may show normal Windows or macOS security warnings; signing or store distribution is optional and is not part of this prototype.

The authoritative mascot artwork remains in `src/assets/mascot`. The desktop build copies those files, plus the official app icon, into its generated `dist` folder so editable artwork is not duplicated in source control.
