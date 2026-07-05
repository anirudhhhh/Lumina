"""Thin ADB wrapper for the dynamic-analysis engine.

Resolves the `adb` executable (bundled `LUMINA_ADB_PATH`, else system PATH) and
provides the handful of operations the Frida engine needs: enumerate devices,
query guest ABI, push/execute binaries, install/uninstall the target and set up
port forwards. All calls are best-effort and raise :class:`AdbError` on failure
so the caller can fall back to simulation.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .. import config


class AdbError(RuntimeError):
    """Raised when an adb invocation fails or adb is unavailable."""


def _adb_bin() -> str:
    p = Path(config.ADB_PATH)
    if p.is_absolute():
        if p.exists():
            return str(p)
        raise AdbError(f"configured adb not found: {p}")
    found = shutil.which(config.ADB_PATH)
    if not found:
        raise AdbError(
            "adb not found. Install platform-tools or run the tools fetch step."
        )
    return found


def available() -> bool:
    try:
        _adb_bin()
        return True
    except AdbError:
        return False


def _run(args: list[str], *, serial: str | None = None, timeout: int = 60) -> str:
    cmd = [_adb_bin()]
    if serial:
        cmd += ["-s", serial]
    cmd += args
    try:
        proc = subprocess.run(
            cmd, capture_output=True, timeout=timeout, text=True, check=False
        )
    except subprocess.TimeoutExpired as exc:  # noqa: BLE001
        raise AdbError(f"adb {' '.join(args)} timed out") from exc
    except Exception as exc:  # noqa: BLE001
        raise AdbError(f"adb {' '.join(args)} failed: {exc}") from exc
    if proc.returncode != 0:
        raise AdbError((proc.stderr or proc.stdout or "adb error").strip())
    return proc.stdout


def devices() -> list[str]:
    """Serials of attached devices/emulators in the `device` state."""
    try:
        out = _run(["devices"])
    except AdbError:
        return []
    serials: list[str] = []
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) >= 2 and parts[1] == "device":
            serials.append(parts[0])
    return serials


def first_device() -> str | None:
    devs = devices()
    return devs[0] if devs else None


def guest_abi(serial: str) -> str:
    """Primary ABI of the guest (e.g. x86_64, arm64-v8a)."""
    out = _run(["shell", "getprop", "ro.product.cpu.abi"], serial=serial).strip()
    return out or "x86_64"


def is_root(serial: str) -> bool:
    """True if we can obtain a root shell (emulator images usually allow it)."""
    try:
        _run(["root"], serial=serial, timeout=20)
    except AdbError:
        pass
    who = _run(["shell", "id", "-u"], serial=serial).strip()
    return who == "0" or who.endswith("uid=0")


def push(serial: str, local: str, remote: str) -> None:
    _run(["push", local, remote], serial=serial, timeout=120)


def shell(serial: str, command: str, *, timeout: int = 60) -> str:
    return _run(["shell", command], serial=serial, timeout=timeout)


def install(serial: str, apk_path: str) -> None:
    _run(["install", "-r", "-g", apk_path], serial=serial, timeout=180)


def uninstall(serial: str, package: str) -> None:
    try:
        _run(["uninstall", package], serial=serial, timeout=60)
    except AdbError:
        pass  # best-effort cleanup


def forward(serial: str, host_port: int, remote: str) -> None:
    _run(["forward", f"tcp:{host_port}", remote], serial=serial)
