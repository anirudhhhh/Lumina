"""Provision frida-server on the guest device.

Picks the frida-server build matching the installed `frida` Python binding and
the guest ABI, caches it locally (downloading from GitHub releases on first use
unless a bundled binary is configured), pushes it to `/data/local/tmp` and
starts it. Requires a rooted guest — standard Android emulator images qualify.
"""
from __future__ import annotations

import lzma
import subprocess
import urllib.request
from pathlib import Path

from .. import config
from . import adb

REMOTE_PATH = "/data/local/tmp/frida-server"

# Guest ABI (ro.product.cpu.abi) -> frida-server android arch suffix.
_ABI_TO_ARCH = {
    "x86_64": "x86_64",
    "x86": "x86",
    "arm64-v8a": "arm64",
    "armeabi-v7a": "arm",
    "armeabi": "arm",
}


class FridaServerError(RuntimeError):
    pass


def _frida_version() -> str:
    try:
        import frida  # type: ignore

        return frida.__version__
    except Exception as exc:  # noqa: BLE001
        raise FridaServerError(f"frida python binding unavailable: {exc}") from exc


def _local_binary(arch: str) -> Path:
    """Return a local frida-server binary for `arch`, downloading if needed."""
    if config.FRIDA_SERVER_PATH:
        p = Path(config.FRIDA_SERVER_PATH)
        if p.exists():
            return p

    version = _frida_version()
    config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = config.CACHE_DIR / f"frida-server-{version}-android-{arch}"
    if dest.exists() and dest.stat().st_size > 0:
        return dest

    url = (
        f"https://github.com/frida/frida/releases/download/{version}"
        f"/frida-server-{version}-android-{arch}.xz"
    )
    try:
        with urllib.request.urlopen(url, timeout=120) as resp:  # noqa: S310
            compressed = resp.read()
        dest.write_bytes(lzma.decompress(compressed))
    except Exception as exc:  # noqa: BLE001
        raise FridaServerError(
            f"could not fetch frida-server {version} for {arch}: {exc}"
        ) from exc
    return dest


def ensure_running(serial: str) -> None:
    """Push (if absent) and start frida-server on the guest. Idempotent."""
    if not adb.is_root(serial):
        raise FridaServerError(
            "guest is not rooted; frida-server needs a rooted emulator/device."
        )

    abi = adb.guest_abi(serial)
    arch = _ABI_TO_ARCH.get(abi)
    if arch is None:
        raise FridaServerError(f"unsupported guest ABI: {abi}")

    # Already listening? A running frida-server holds tcp:27042.
    try:
        listening = adb.shell(serial, "ps -A | grep frida-server", timeout=20)
        if "frida-server" in listening:
            return
    except adb.AdbError:
        pass

    binary = _local_binary(arch)
    adb.push(serial, str(binary), REMOTE_PATH)
    adb.shell(serial, f"chmod 755 {REMOTE_PATH}", timeout=20)

    # Launch detached; the shell returns immediately.
    try:
        subprocess.Popen(  # noqa: S603
            [
                config.ADB_PATH, "-s", serial, "shell",
                f"{REMOTE_PATH} &",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as exc:  # noqa: BLE001
        raise FridaServerError(f"failed to start frida-server: {exc}") from exc
