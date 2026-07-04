<div align="center">

# LUMINA

**AI-powered desktop tool for automated reverse engineering, static & dynamic analysis, and risk scoring of fraudulent Android APKs and malware.**

`Cybersecurity, Fraud & AI Hackathon 2026 — PS1`

</div>

---

Lumina automates the complete mobile-malware analysis pipeline by combining
**reverse engineering** (Androguard + JADX), **static & dynamic analysis**
(regex/heuristics + Frida on a sandboxed emulator), and **Generative AI** to
produce explainable threat detection and intelligent risk scoring.

## Architecture

Lumina is a **Tauri** desktop app (Rust core + React webview) that orchestrates
a bundled **Python microservice** for the heavy analysis work.

```
┌──────────────────────────────────────────────────────────────┐
│  Tauri Desktop App                                            │
│                                                              │
│   React / UI  ──IPC (invoke)──▶  Rust Core (Orchestrator)    │
│   (src/)                          (src-tauri/)               │
│   • APK upload                    • File/Hash manager        │
│   • Live terminal                 • Python process spawner   │
│   • Dashboard                     • ADB / emulator wrapper   │
│   • HTML/PDF report               • Command IPC surface      │
│                                          │ HTTP (127.0.0.1:8756)
│                                          ▼                    │
│              Bundled Local Python Microservice (FastAPI)     │
│              (python-service/)                               │
│   ┌───────────────┬──────────────┬────────────────────────┐ │
│   │ STATIC        │ GEN-AI BRIDGE│ DYNAMIC                 │ │
│   │ Androguard    │ Prompt build │ Frida hook generator    │ │
│   │ JADX wrapper  │ LLM synth    │ Emulator runner         │ │
│   │ Regex/heur.   │ Risk scoring │ Runtime data catcher    │ │
│   └───────────────┴──────────────┴────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
      │                    │                     │
   Local Disk          LLM Engine          Bundled Emulator
 (dex/manifest)   (OpenAI-compat/local)   (ADB + Frida server)
```

### Pipeline (PS1 phases 1–8)

1. **Surface audit** — manifest + dangerous-permission mapping (Androguard)
2. **IoC extraction** — hardcoded URLs/IPs/domains + taint hints (regex/strings)
3. **Heuristic signatures** — obfuscation, root-detection, `DexClassLoader`, etc.
4. **Gen-AI minification** — flagged classes decompiled by JADX, minified to a dense JSON payload
5. **Gen-AI interpretation** — LLM explains intent + builds an investigation plan
6. **Risk scoring** — weighted model → `BENIGN / SUSPICIOUS / MALICIOUS`
7. **Intelligence enrichment** — IoC reputation lookups
8. **Report generation** — analyst-style security report

Dynamic analysis then generates **Frida hooks** from the static findings, runs
the APK in a **sandboxed emulator**, captures runtime evidence, and re-scores.

## Tech stack

| Layer     | Tech |
|-----------|------|
| UI        | React 18 · TypeScript · Vite · Tailwind CSS · Zustand |
| Core      | Tauri 2 · Rust (tokio, reqwest, sha2) |
| Analysis  | Python 3.12 · FastAPI · Androguard · JADX · Frida |
| Gen-AI    | OpenAI · Google Gemini · OpenRouter · any OpenAI-compatible endpoint (BYO key) |

## Prerequisites

- **Node.js** ≥ 18 and npm
- **Rust** toolchain (`rustup`) — required to build the Tauri core. Install from <https://rustup.rs>
- **Python** 3.10+
- **JADX** (optional, for decompilation) — on `PATH` or set `LUMINA_JADX_PATH`
- **Android SDK platform-tools** (`adb`) + an emulator with **frida-server** (optional, for dynamic analysis)

> On Windows, Tauri also needs the **WebView2** runtime (preinstalled on Win 11)
> and the **MSVC Build Tools**.

## Setup

```bash
# 1. Frontend deps
npm install

# 2. Python analysis service deps — install into a virtualenv (recommended)
npm run py:setup          # Windows  → creates python-service/.venv + installs
#   or, on macOS/Linux:
npm run py:setup:unix
```

> **Why a venv?** Yes — always install the Python service into a virtualenv.
> `androguard` pulls in a large, tightly-coupled dependency tree; installing it
> into your global site-packages is what produces the *"package version
> mismatch"* errors, because it collides with whatever else is already there.
> A clean `.venv` isolates it. The Tauri core **auto-detects**
> `python-service/.venv` and launches the service with it — no activation
> needed. If you'd rather do it by hand:
>
> ```bash
> cd python-service
> python -m venv .venv
> .venv/Scripts/python -m pip install -r requirements.txt   # Windows
> # ./.venv/bin/python -m pip install -r requirements.txt    # macOS/Linux
> ```
>
> Use **Python 3.10–3.12** (androguard has trouble on 3.13+). Note
> `requirements.txt` now uses version *ranges* rather than hard pins so pip can
> resolve a consistent set for your interpreter.

```bash
# 3. (optional) seed an LLM key via env — or just do it in-app (see below)
cp .env.example .env      # then edit
```

### LLM providers (bring your own key)

Lumina uses **your own** API keys and compute — there is no shared/bundled key.
On first launch an **onboarding** screen asks you to pick a provider and paste a
key (or skip). You can change the provider, key, and model anytime from the
**Settings** page.

| Provider    | Get a key |
|-------------|-----------|
| OpenAI      | <https://platform.openai.com/api-keys> |
| Google Gemini | <https://aistudio.google.com/app/apikey> |
| OpenRouter  | <https://openrouter.ai/keys> |
| Custom      | any OpenAI-compatible base URL (Ollama, LM Studio, Azure, …) |

Keys are stored locally in `~/.lumina/config.json` and never leave your machine.
The active provider powers both **AI synthesis** in the pipeline and the
**Chat** analyst shell.

## Running

### Full desktop app (recommended)

Tauri auto-spawns the Python service and the Vite dev server:

```bash
npm run app:dev      # = tauri dev
```

Build a distributable:

```bash
npm run app:build    # = tauri build
```

### Running pieces individually (for development)

```bash
# Python analysis service on http://127.0.0.1:8756
npm run py:dev
#   docs at http://127.0.0.1:8756/docs

# Frontend only, in the browser (uses mock data — no Tauri/Python needed)
npm run dev          # http://localhost:1420
```

> **Browser preview mode:** when the UI is opened outside the Tauri webview it
> automatically falls back to mock data (`src/lib/mock.ts`), so you can explore
> the full design system without the backend running.

## Project layout

```
Lumina/
├── src/                     # React frontend
│   ├── components/          # AppShell, TUI primitives
│   ├── pages/               # Dashboard, Workspace, Emulation, Chat, Reports, Settings
│   ├── lib/                 # types, Tauri API wrappers, mock data
│   └── store/               # Zustand analysis store
├── src-tauri/               # Tauri Rust core (orchestrator)
│   └── src/                 # commands, python spawner, adb, models
├── python-service/          # FastAPI analysis microservice
│   └── app/
│       ├── analysis/        # static, decompile, genai, dynamic, risk
│       ├── pipeline.py      # phase orchestration
│       ├── store.py         # report registry
│       └── main.py          # REST routes
├── design.md                # Lumina design system (colors, type, tokens)
└── reference.html           # TUI layout references
```

## Design system

The UI follows the **"Human-Technical Collage"** identity in `design.md`:
Deep-navy canvas, Playfair Display headlines, JetBrains Mono body, terracotta
alert / sage accents, and a TUI (terminal UI) aesthetic. Tokens live in
`tailwind.config.js` and `src/index.css`.

## Notes & next steps

- **LLM**: configure a provider key in onboarding / Settings (or seed one via
  `LUMINA_LLM_API_KEY`). Without any key, a deterministic heuristic synthesis is
  used so the pipeline always produces output; the **Chat** shell needs a key.
- **Chat**: the `CHAT` tab is a Claude-Code-CLI-style analyst shell — discuss a
  vulnerability or the loaded sample. Slash commands: `/help`, `/model`,
  `/provider`, `/providers`, `/context on|off`, `/report`, `/clear`, `/settings`.
- **JADX / Frida**: both degrade gracefully — the pipeline runs on Androguard
  output alone and simulates a runtime trace when Frida/emulator are absent.
- Bring your own APK samples (e.g. the **MalDroid-2020** / **AndroZoo** datasets
  referenced in the problem statement). Do **not** commit APKs (git-ignored).

> ⚠️ Analyze untrusted APKs only inside the sandboxed emulator. Lumina is a
> defensive security / research tool.
