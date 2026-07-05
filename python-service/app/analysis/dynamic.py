"""Dynamic analysis — secure emulation + Frida runtime instrumentation.

Two entry points:

* :func:`run` — synchronous single-shot used by the pipeline; returns a
  :class:`DynamicResult`.
* :func:`start` / :func:`poll` — background job + cursor-based event polling so
  the UI can stream the runtime trace live while the sample executes.

The engine is emulator-agnostic: it drives whatever Android target is reachable
over adb (a physical device, an existing AVD, or a bundled QEMU sandbox added
later). When no live device + frida is available it produces a deterministic,
*streamed* simulated trace so the UI and risk pipeline stay fully functional.
"""
from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime, timezone

from .. import config, store
from ..models import AiSynthesis, DynamicResult, FridaHook, IoC, RuntimeEvent, StaticResult
from . import adb, frida_server, risk
from .genai import HOOK_TARGETS, _frida_script


class EmulatorError(RuntimeError):
    """Raised when a live dynamic run cannot be performed."""


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S:%f")[:-3]


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ev(kind, message, detail=None, severity=None) -> RuntimeEvent:
    return RuntimeEvent(ts=_now(), kind=kind, message=message, detail=detail, severity=severity)


# Reverse map: target class -> finding category, for confirming static findings.
_CLASS_TO_CATEGORY = {cls: cat for cat, (cls, _m) in HOOK_TARGETS.items()}

# Baseline coverage hooks, always loaded so a run yields signal even when the AI
# produced no targeted hooks.
_DEFAULT_TARGETS = [
    ("java.net.URL", "openConnection"),
    ("javax.crypto.Cipher", "doFinal"),
    ("dalvik.system.DexClassLoader", "loadClass"),
    ("java.lang.Runtime", "exec"),
    ("android.telephony.SmsManager", "sendTextMessage"),
]


def _default_hooks() -> list[FridaHook]:
    return [
        FridaHook(
            id=f"D-{uuid.uuid4().hex[:4]}",
            target_class=cls,
            target_method=method,
            reason="Baseline runtime coverage",
            script=_frida_script(cls, method),
        )
        for cls, method in _DEFAULT_TARGETS
    ]


def _classify(hook_name: str) -> tuple[str, str]:
    """Map a fired hook 'cls.method' to a (RuntimeEvent.kind, severity)."""
    low = hook_name.lower()
    if any(t in low for t in ("url", "http", "socket", "connection")):
        return "NETWORK", "HIGH"
    if "sms" in low:
        return "HOOK", "CRITICAL"
    if any(t in low for t in ("classloader", "runtime", "exec")):
        return "HOOK", "HIGH"
    return "CALL", "MEDIUM"


# --- real (frida) path -------------------------------------------------------

def _run_real(
    static: StaticResult,
    ai: AiSynthesis | None,
    emit,
    sample_seconds: int,
) -> DynamicResult:
    """Instrument the target on a live rooted guest. Raises EmulatorError on any
    provisioning problem so the caller can fall back to simulation."""
    try:
        import frida  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise EmulatorError(f"frida not installed: {exc}") from exc

    if not adb.available():
        raise EmulatorError("adb not found (install platform-tools / fetch tools).")
    serial = adb.first_device()
    if not serial:
        raise EmulatorError("no device/emulator attached over adb.")
    pkg = static.meta.package_name
    if not pkg:
        raise EmulatorError("package name unknown; cannot spawn target.")

    emit(_ev("SYS", f"Device selected: {serial}"))
    frida_server.ensure_running(serial)
    emit(_ev("SYS", "frida-server active on guest"))

    adb.install(serial, static.meta.path)
    emit(_ev("SYS", f"Installed {pkg}"))

    mgr = frida.get_device_manager()
    try:
        device = mgr.get_device(serial, timeout=10)
    except Exception:  # noqa: BLE001
        device = frida.get_usb_device(timeout=10)

    collected: list[RuntimeEvent] = []
    fired_classes: set[str] = set()
    lock = threading.Lock()

    def record(ev: RuntimeEvent) -> None:
        with lock:
            collected.append(ev)
        emit(ev)

    def on_message(message, _data):
        if message.get("type") == "send":
            payload = message.get("payload") or {}
            name = str(payload.get("hook", "?"))
            kind, sev = _classify(name)
            args = payload.get("args") or []
            fired_classes.add(name.rsplit(".", 1)[0])
            record(_ev(kind, f"HOOK: {name}", detail=", ".join(map(str, args))[:400], severity=sev))
        elif message.get("type") == "error":
            record(_ev("SYS", "Script error", detail=str(message.get("description"))))

    pid = device.spawn([pkg])
    session = device.attach(pid)
    scripts = []
    for hook in _default_hooks() + list(ai.hooks if ai else []):
        if not hook.script:
            continue
        try:
            s = session.create_script(hook.script)
            s.on("message", on_message)
            s.load()
            scripts.append(s)
        except Exception as exc:  # noqa: BLE001
            emit(_ev("SYS", f"Hook load failed: {hook.target_class}", detail=str(exc)))
    emit(_ev("SYS", f"{len(scripts)} hook(s) armed; resuming process"))
    device.resume(pid)

    waited = 0.0
    while waited < sample_seconds:
        time.sleep(0.5)
        waited += 0.5

    for s in scripts:
        try:
            s.unload()
        except Exception:  # noqa: BLE001
            pass
    try:
        session.detach()
    except Exception:  # noqa: BLE001
        pass
    try:
        device.kill(pid)
    except Exception:  # noqa: BLE001
        pass
    adb.uninstall(serial, pkg)
    emit(_ev("SYS", "Sampling complete; target uninstalled"))

    fired_categories = {_CLASS_TO_CATEGORY.get(c) for c in fired_classes}
    fired_categories.discard(None)
    confirmed = [f.id for f in static.findings if f.category in fired_categories]
    endpoints = [
        IoC(type="URL", value=e.detail or e.message, reputation="SUSPICIOUS", source="frida/runtime")
        for e in collected
        if e.kind == "NETWORK" and e.detail
    ]
    with lock:
        events = list(collected)
    return DynamicResult(events=events, confirmed_findings=confirmed, network_endpoints=endpoints)


# --- simulated path ----------------------------------------------------------

def _simulate(static: StaticResult, ai: AiSynthesis | None, emit) -> DynamicResult:
    """Deterministic trace derived from static findings. `emit` streams each
    event (with a small delay) so the UI animates like a live run."""
    def step(ev: RuntimeEvent, delay: float = 0.25) -> RuntimeEvent:
        emit(ev)
        time.sleep(delay)
        return ev

    events: list[RuntimeEvent] = [
        step(_ev("SYS", "Process spawned: zygote64")),
        step(_ev("SYS", "Loading native libs: libart.so")),
        step(_ev("SYS", "Simulated trace (no live device attached)")),
    ]
    confirmed: list[str] = []
    endpoints: list[IoC] = []

    for f in static.findings:
        if f.severity in ("CRITICAL", "HIGH"):
            events.append(step(_ev("HOOK", f"HOOK_FIRED: {f.category}", detail=f.evidence, severity=f.severity)))
            confirmed.append(f.id)

    for ioc in static.iocs:
        if ioc.type in ("IP", "URL", "DOMAIN") and ioc.reputation != "BENIGN":
            events.append(step(_ev("NETWORK", "NETWORK_EVENT_TRIGGERED", detail=f"CONNECT {ioc.value}", severity="HIGH")))
            endpoints.append(ioc)

    return DynamicResult(events=events, confirmed_findings=confirmed, network_endpoints=endpoints)


def _resolve_mode() -> str:
    mode = config.DYNAMIC_MODE
    if mode in ("real", "simulate"):
        return mode
    return "real" if (adb.available() and adb.first_device()) else "simulate"


# --- synchronous entry (pipeline) -------------------------------------------

def run(static: StaticResult, ai: AiSynthesis | None) -> DynamicResult:
    """Single-shot dynamic run for the pipeline (no live streaming)."""
    def emit(_ev_):  # discard — no streaming sink
        return None

    mode = _resolve_mode()
    if mode == "real":
        try:
            return _run_real(static, ai, emit, config.DYNAMIC_SAMPLE_SECONDS)
        except Exception as exc:  # noqa: BLE001
            print(f"[dynamic] real run failed, simulating: {exc}")
    return _simulate(static, ai, lambda e: None)


# --- streaming entry (background job + polling) ------------------------------

class _Job:
    __slots__ = ("events", "running", "error", "mode", "lock")

    def __init__(self) -> None:
        self.events: list[RuntimeEvent] = []
        self.running: bool = True
        self.error: str | None = None
        self.mode: str = "pending"
        self.lock = threading.Lock()


_jobs: dict[str, _Job] = {}


def _execute(report, job: _Job) -> None:
    def emit(ev: RuntimeEvent) -> None:
        with job.lock:
            job.events.append(ev)

    try:
        mode = _resolve_mode()
        if mode == "real":
            try:
                dyn = _run_real(report.static, report.ai, emit, config.DYNAMIC_SAMPLE_SECONDS)
                job.mode = "real"
            except Exception as exc:  # noqa: BLE001
                emit(_ev("SYS", "Live run unavailable — simulating", detail=str(exc)))
                job.mode = "simulated"
                dyn = _simulate(report.static, report.ai, emit)
        else:
            job.mode = "simulated"
            dyn = _simulate(report.static, report.ai, emit)

        report.dynamic = dyn
        report.risk = risk.score(report.static, dyn)
        report.stage = "COMPLETE"
        report.generated_at = _iso()
        store.put_report(report)
    except Exception as exc:  # noqa: BLE001
        job.error = str(exc)
        emit(_ev("SYS", "Dynamic run error", detail=str(exc)))
    finally:
        job.running = False


def start(report) -> dict:
    """Kick off a background dynamic run; returns an initial status snapshot."""
    job = _Job()
    _jobs[report.meta.id] = job
    threading.Thread(target=_execute, args=(report, job), daemon=True).start()
    return {"apkId": report.meta.id, "running": True, "mode": job.mode, "cursor": 0}


def poll(apk_id: str, cursor: int = 0) -> dict:
    """Return runtime events after `cursor`, plus run status."""
    job = _jobs.get(apk_id)
    if job is None:
        return {"events": [], "cursor": cursor, "running": False, "mode": None,
                "error": "no active run", "finalized": True}
    with job.lock:
        new_events = job.events[cursor:]
        new_cursor = len(job.events)
        running, error, mode = job.running, job.error, job.mode
    return {
        "events": [e.model_dump(by_alias=True) for e in new_events],
        "cursor": new_cursor,
        "running": running,
        "mode": mode,
        "error": error,
        "finalized": not running,
    }
