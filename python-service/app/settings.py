"""Persisted, user-editable runtime settings (LLM providers & keys).

Users bring their own API keys. Settings live in a JSON file on disk
(``~/.lumina/config.json`` by default) so they survive restarts and can be
edited from the desktop UI at any time. Environment variables (see
``config.py`` / ``.env``) act as the initial seed when no file exists yet.

Keys are stored locally only and are NEVER returned verbatim over the REST
surface — :func:`public_view` masks them so the frontend can show *whether*
a provider is configured without exposing the secret.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from . import config

# Where the editable settings blob lives (sibling of the workspace).
CONFIG_PATH = Path(config.WORKSPACE).parent / "config.json"

_lock = threading.Lock()
_cache: dict[str, Any] | None = None

# Provider catalogue. Every provider speaks the OpenAI-compatible protocol, so
# the only thing that varies is the base URL, the default model and the key.
PROVIDERS = ("openai", "gemini", "openrouter", "custom")

PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {
        "label": "OpenAI",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "docs": "https://platform.openai.com/api-keys",
    },
    "gemini": {
        "label": "Google Gemini",
        # Gemini's OpenAI-compatible shim.
        "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "model": "gemini-2.0-flash",
        "docs": "https://aistudio.google.com/app/apikey",
    },
    "openrouter": {
        "label": "OpenRouter",
        "baseUrl": "https://openrouter.ai/api/v1",
        "model": "openai/gpt-4o-mini",
        "docs": "https://openrouter.ai/keys",
    },
    "custom": {
        "label": "Custom (OpenAI-compatible)",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "docs": "",
    },
}


def _seed_from_env() -> dict[str, Any]:
    """Build the initial settings blob, seeding OpenAI from env/.env if set."""
    providers: dict[str, Any] = {}
    for name, d in PROVIDER_DEFAULTS.items():
        providers[name] = {
            "apiKey": "",
            "baseUrl": d["baseUrl"],
            "model": d["model"],
        }
    # Back-compat: honour the legacy LUMINA_LLM_* env vars as the OpenAI seed.
    if config.LLM_API_KEY:
        providers["openai"]["apiKey"] = config.LLM_API_KEY
        providers["openai"]["baseUrl"] = config.LLM_BASE_URL
        providers["openai"]["model"] = config.LLM_MODEL
    return {
        "activeProvider": "openai",
        "providers": providers,
        "onboarded": False,
    }


def _load() -> dict[str, Any]:
    global _cache
    if _cache is not None:
        return _cache
    data: dict[str, Any]
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text("utf-8"))
        except Exception as exc:  # noqa: BLE001
            print(f"[settings] failed to read {CONFIG_PATH}: {exc}; using defaults")
            data = _seed_from_env()
    else:
        data = _seed_from_env()
    # Ensure every known provider is present (forward-compat on new versions).
    data.setdefault("activeProvider", "openai")
    data.setdefault("onboarded", False)
    provs = data.setdefault("providers", {})
    for name, d in PROVIDER_DEFAULTS.items():
        p = provs.setdefault(name, {})
        p.setdefault("apiKey", "")
        p.setdefault("baseUrl", d["baseUrl"])
        p.setdefault("model", d["model"])
    _cache = data
    return data


def _save(data: dict[str, Any]) -> None:
    global _cache
    _cache = data
    try:
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(data, indent=2), "utf-8")
    except Exception as exc:  # noqa: BLE001
        print(f"[settings] failed to persist {CONFIG_PATH}: {exc}")


# --- public API -----------------------------------------------------------

def active_provider() -> str:
    return _load().get("activeProvider", "openai")


def provider_config(name: str | None = None) -> dict[str, str]:
    """Resolve a provider's effective config (key/base/model)."""
    data = _load()
    name = name or data.get("activeProvider", "openai")
    prov = dict(PROVIDER_DEFAULTS.get(name, PROVIDER_DEFAULTS["custom"]))
    prov.update(data["providers"].get(name, {}))
    return {
        "provider": name,
        "apiKey": prov.get("apiKey", ""),
        "baseUrl": prov.get("baseUrl") or PROVIDER_DEFAULTS["custom"]["baseUrl"],
        "model": prov.get("model") or "gpt-4o-mini",
    }


def has_key(name: str | None = None) -> bool:
    return bool(provider_config(name).get("apiKey"))


def is_onboarded() -> bool:
    return bool(_load().get("onboarded", False))


def _mask(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:3]}…{key[-4:]}"


def public_view() -> dict[str, Any]:
    """Settings blob safe to send to the UI — keys are masked, not exposed."""
    data = _load()
    provs = {}
    for name in PROVIDERS:
        p = data["providers"].get(name, {})
        key = p.get("apiKey", "")
        provs[name] = {
            "label": PROVIDER_DEFAULTS[name]["label"],
            "baseUrl": p.get("baseUrl", PROVIDER_DEFAULTS[name]["baseUrl"]),
            "model": p.get("model", PROVIDER_DEFAULTS[name]["model"]),
            "hasKey": bool(key),
            "keyHint": _mask(key),
            "docs": PROVIDER_DEFAULTS[name]["docs"],
        }
    return {
        "activeProvider": data.get("activeProvider", "openai"),
        "onboarded": bool(data.get("onboarded", False)),
        "providers": provs,
    }


def update(patch: dict[str, Any]) -> dict[str, Any]:
    """Apply a partial update from the UI and persist it.

    ``patch`` shape (all optional)::

        {
          "activeProvider": "gemini",
          "onboarded": true,
          "providers": {
            "gemini": {"apiKey": "…", "model": "…", "baseUrl": "…"}
          }
        }

    For each provider, an ``apiKey`` is only overwritten when a non-empty
    string is supplied — the UI sends masked placeholders, never the real key,
    so an untouched field leaves the stored secret intact.
    """
    with _lock:
        data = _load()
        if "activeProvider" in patch and patch["activeProvider"] in PROVIDERS:
            data["activeProvider"] = patch["activeProvider"]
        if "onboarded" in patch:
            data["onboarded"] = bool(patch["onboarded"])
        for name, incoming in (patch.get("providers") or {}).items():
            if name not in PROVIDERS or not isinstance(incoming, dict):
                continue
            target = data["providers"].setdefault(name, {})
            new_key = incoming.get("apiKey")
            if isinstance(new_key, str) and new_key.strip():
                target["apiKey"] = new_key.strip()
            if incoming.get("clearKey"):
                target["apiKey"] = ""
            if isinstance(incoming.get("model"), str) and incoming["model"].strip():
                target["model"] = incoming["model"].strip()
            if isinstance(incoming.get("baseUrl"), str) and incoming["baseUrl"].strip():
                target["baseUrl"] = incoming["baseUrl"].strip()
        _save(data)
    return public_view()
