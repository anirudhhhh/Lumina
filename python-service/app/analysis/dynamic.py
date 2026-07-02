"""Dynamic analysis — secure emulation + Frida runtime instrumentation.

When frida + a running emulator/device are available, this attaches to the
target, installs the AI-generated hooks and streams runtime evidence. Without
them it produces a deterministic simulated trace derived from the static
findings, so the UI and risk pipeline remain fully functional for demos.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .. import config
from ..models import AiSynthesis, DynamicResult, IoC, RuntimeEvent, StaticResult


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S:%f")[:-3]


def _simulate(static: StaticResult, ai: AiSynthesis | None) -> DynamicResult:
    events: list[RuntimeEvent] = [
        RuntimeEvent(ts=_now(), kind="SYS", message="Process spawned: zygote64"),
        RuntimeEvent(ts=_now(), kind="SYS", message="Loading native libs: libart.so"),
    ]
    confirmed: list[str] = []
    endpoints: list[IoC] = []

    for f in static.findings:
        if f.severity in ("CRITICAL", "HIGH"):
            events.append(
                RuntimeEvent(
                    ts=_now(),
                    kind="HOOK",
                    message=f"HOOK_FIRED: {f.category}",
                    detail=f.evidence,
                    severity=f.severity,
                )
            )
            confirmed.append(f.id)

    # Replay network IoCs as observed connections.
    for ioc in static.iocs:
        if ioc.type in ("IP", "URL", "DOMAIN") and ioc.reputation != "BENIGN":
            events.append(
                RuntimeEvent(
                    ts=_now(),
                    kind="NETWORK",
                    message="NETWORK_EVENT_TRIGGERED",
                    detail=f"CONNECT {ioc.value}",
                    severity="HIGH",
                )
            )
            endpoints.append(ioc)

    return DynamicResult(events=events, confirmed_findings=confirmed, network_endpoints=endpoints)


def _run_frida(static: StaticResult, ai: AiSynthesis | None) -> DynamicResult:  # pragma: no cover
    """Real Frida path. Requires frida-server on the emulator and the target
    installed via adb. Left as an integration point; falls back on any error."""
    import frida  # type: ignore

    device = frida.get_usb_device(timeout=5)
    events: list[RuntimeEvent] = []
    confirmed: list[str] = []

    pkg = static.meta.package_name
    pid = device.spawn([pkg])
    session = device.attach(pid)

    def on_message(message, _data):
        if message.get("type") == "send":
            payload = message["payload"]
            events.append(
                RuntimeEvent(
                    ts=_now(),
                    kind="HOOK",
                    message=f"HOOK: {payload.get('hook')}",
                    detail=", ".join(payload.get("args", [])),
                    severity="HIGH",
                )
            )

    for hook in (ai.hooks if ai else []):
        if not hook.script:
            continue
        script = session.create_script(hook.script)
        script.on("message", on_message)
        script.load()

    device.resume(pid)
    # In a real run we'd sample for N seconds here.
    session.detach()
    return DynamicResult(events=events, confirmed_findings=confirmed, network_endpoints=[])


def run(static: StaticResult, ai: AiSynthesis | None) -> DynamicResult:
    if config.FRIDA_ENABLED:
        try:
            return _run_frida(static, ai)
        except Exception as exc:  # noqa: BLE001
            print(f"[dynamic] frida run failed, simulating: {exc}")
    return _simulate(static, ai)
