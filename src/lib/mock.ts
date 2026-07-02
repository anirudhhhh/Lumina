// Mock data used when the UI runs outside the Tauri webview (browser preview).
import type { AnalysisReport, RuntimeEvent, ServiceHealth } from "./types";

export function mockHealth(): ServiceHealth {
  return {
    ok: true,
    version: "0.1.0-mock",
    androguard: true,
    jadx: true,
    frida: true,
    llm: false,
  };
}

export function mockReport(): AnalysisReport {
  return {
    meta: {
      id: "APK_8f4e912c",
      fileName: "com.example.vulnerable_app_v2.1.apk",
      path: "/mock/com.example.vulnerable_app_v2.1.apk",
      sha256: "8f4e912c9a1d4e2b7c6f0a3e5d8b1c4f9e2a7d0b3c6f1e4a8d2b5c9f0e3a6d1b",
      sizeBytes: 8_421_336,
      packageName: "com.example.malware",
      versionName: "2.1",
      minSdk: 21,
      targetSdk: 33,
    },
    stage: "COMPLETE",
    risk: {
      score: 87,
      verdict: "MALICIOUS",
      confidence: 0.942,
      factors: [
        { label: "Dynamic payload loading (DexClassLoader)", weight: 0.28 },
        { label: "SMS intercept + Internet permission combo", weight: 0.24 },
        { label: "Hardcoded C2 endpoint", weight: 0.2 },
        { label: "Custom native crypto routine", weight: 0.16 },
        { label: "Root detection / evasion loops", weight: 0.12 },
      ],
    },
    static: {
      meta: {
        id: "APK_8f4e912c",
        fileName: "com.example.vulnerable_app_v2.1.apk",
        path: "/mock/com.example.vulnerable_app_v2.1.apk",
        sha256: "8f4e912c9a...",
        sizeBytes: 8_421_336,
        packageName: "com.example.malware",
      },
      permissions: [
        { name: "android.permission.SEND_SMS", dangerous: true, description: "Send SMS messages" },
        { name: "android.permission.RECEIVE_SMS", dangerous: true, description: "Intercept incoming SMS" },
        { name: "android.permission.INTERNET", dangerous: false, description: "Open network sockets" },
        { name: "android.permission.READ_CONTACTS", dangerous: true, description: "Read the user's contacts" },
        { name: "android.permission.ACCESS_FINE_LOCATION", dangerous: true },
        { name: "android.permission.WAKE_LOCK", dangerous: false },
      ],
      findings: [
        { id: "F-001", title: "SMS Hijacking Attempt", category: "SMS_HIJACKING", severity: "CRITICAL", confidence: 0.98, file: "MainActivity.java", line: 42, evidence: "SmsManager.sendTextMessage() with attacker-controlled recipient" },
        { id: "F-002", title: "Dynamic Payload Loading", category: "DYNAMIC_LOAD", severity: "HIGH", confidence: 0.91, file: "MainActivity.java", line: 12, evidence: "DexClassLoader loads remote http://192.168.1.100/p.dex" },
        { id: "F-003", title: "Reflective Method Invocation", category: "REFLECTION", severity: "MEDIUM", confidence: 0.72 },
        { id: "F-004", title: "Hardcoded AES IV", category: "CRYPT_WEAKNESS", severity: "LOW", confidence: 1.0 },
      ],
      iocs: [
        { type: "DOMAIN", value: "api.stealth-update.ru", reputation: "BLACKLISTED", source: "regex/strings" },
        { type: "IP", value: "192.168.1.100", reputation: "SUSPICIOUS", source: "regex/strings" },
        { type: "DOMAIN", value: "analytics.google.com", reputation: "BENIGN", source: "regex/strings" },
      ],
      decompiledFiles: [
        "com/example/malware/MainActivity.java",
        "com/example/malware/PayloadService.java",
        "com/example/malware/CryptoUtil.java",
      ],
    },
    ai: {
      summary:
        "Application exhibits high-confidence patterns of data exfiltration and dynamic payload execution. A custom encryption routine in libnative-lib.so decodes payloads post-initialization.",
      intent: "Credential/SMS theft with remote code execution capability.",
      investigationPlan: [
        "Hook SmsManager.sendTextMessage to capture exfiltrated recipients",
        "Trace DexClassLoader.loadClass to capture the fetched payload",
        "Monitor libnative-lib.so JNI boundary for decrypted strings",
      ],
      recommendation: "DO NOT DEPLOY TO PRODUCTION. Quarantine and report C2 infrastructure.",
      hooks: [
        { id: "H-1", targetClass: "android.telephony.SmsManager", targetMethod: "sendTextMessage", reason: "Confirm SMS exfiltration" },
        { id: "H-2", targetClass: "dalvik.system.DexClassLoader", targetMethod: "loadClass", reason: "Capture dynamic payload" },
      ],
    },
    generatedAt: new Date(0).toISOString(),
  };
}

export function mockRuntimeEvents(): RuntimeEvent[] {
  return [
    { ts: "00:00:00:000", kind: "SYS", message: "Process spawned: zygote64" },
    { ts: "00:00:00:125", kind: "SYS", message: "Loading native libs: libart.so" },
    { ts: "00:00:00:830", kind: "CALL", message: "java.lang.Runtime.exec()", detail: "su -c 'chmod 777 /data/local/tmp'", severity: "HIGH" },
    { ts: "00:00:01:450", kind: "SYS", message: "GC_FOR_ALLOC freed 1024K" },
    { ts: "00:00:02:110", kind: "NETWORK", message: "NETWORK_EVENT_TRIGGERED", detail: "CONNECT 192.168.1.100:4444 — SIG_MATCH C2_SERVER_PATTERN_#441-A", severity: "CRITICAL" },
  ];
}
