"""Thin provider-agnostic LLM client.

Every supported provider (OpenAI, Google Gemini, OpenRouter, or any custom
OpenAI-compatible endpoint) is reached through the ``openai`` SDK — only the
base URL, model and key differ. The active provider is resolved live from the
user-editable settings (``app/settings.py``) so key/model changes take effect
without restarting the service.
"""
from __future__ import annotations

from typing import Any

from .. import settings


class LlmError(RuntimeError):
    """Raised when a chat/completion call cannot be fulfilled."""


def available(provider: str | None = None) -> bool:
    """True when the (active or named) provider has an API key configured."""
    return settings.has_key(provider)


def _client(cfg: dict[str, str]):
    try:
        from openai import OpenAI
    except Exception as exc:  # noqa: BLE001
        raise LlmError(
            "The 'openai' package is not installed. Run "
            "`pip install -r requirements.txt` in the python-service venv."
        ) from exc
    return OpenAI(api_key=cfg["apiKey"], base_url=cfg["baseUrl"])


def complete(
    messages: list[dict[str, str]],
    *,
    provider: str | None = None,
    temperature: float = 0.3,
    response_json: bool = False,
    max_tokens: int | None = None,
    timeout: float | None = None,
) -> str:
    """Run a chat completion against the resolved provider and return text."""
    cfg = settings.provider_config(provider)
    if not cfg.get("apiKey"):
        raise LlmError(
            f"No API key configured for provider '{cfg['provider']}'. "
            "Add one in Settings or during onboarding."
        )
    client = _client(cfg)
    kwargs: dict[str, Any] = {
        "model": cfg["model"],
        "messages": messages,
        "temperature": temperature,
    }
    if response_json:
        kwargs["response_format"] = {"type": "json_object"}
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    if timeout:
        # Bound the request so a slow/large call can't stall the pipeline; the
        # caller falls back to heuristic synthesis on timeout.
        kwargs["timeout"] = timeout
    try:
        resp = client.chat.completions.create(**kwargs)
    except Exception as exc:  # noqa: BLE001
        raise LlmError(str(exc)) from exc
    return resp.choices[0].message.content or ""


def describe() -> dict[str, str]:
    """Active provider + model, for surfacing in the UI/health."""
    cfg = settings.provider_config()
    return {"provider": cfg["provider"], "model": cfg["model"], "hasKey": bool(cfg["apiKey"])}
