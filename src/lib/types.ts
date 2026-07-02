// Shared domain model for Lumina analysis pipeline.
// Mirrors the JSON contract produced by the Python microservice (see
// python-service/app/models.py) and relayed by the Tauri Rust core.

export type Verdict = "BENIGN" | "SUSPICIOUS" | "MALICIOUS" | "UNKNOWN";

export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AnalysisStage =
  | "IDLE"
  | "UPLOADING"
  | "STATIC_PARSING"
  | "STATIC_DECOMPILE"
  | "GENAI_SYNTHESIS"
  | "DYNAMIC_EMULATION"
  | "REPORTING"
  | "COMPLETE"
  | "ERROR";

export interface ApkMeta {
  id: string;
  fileName: string;
  path: string;
  sha256: string;
  sizeBytes: number;
  packageName?: string;
  versionName?: string;
  minSdk?: number;
  targetSdk?: number;
}

export interface PermissionFinding {
  name: string;
  dangerous: boolean;
  description?: string;
}

export interface Finding {
  id: string;
  title: string;
  category: string; // e.g. SMS_HIJACKING, DYNAMIC_LOAD, CRYPT_WEAKNESS
  severity: Severity;
  confidence: number; // 0..1
  evidence?: string;
  file?: string;
  line?: number;
}

export interface IoC {
  type: "URL" | "IP" | "DOMAIN" | "CRYPTO" | "CERT";
  value: string;
  reputation?: "BENIGN" | "SUSPICIOUS" | "BLACKLISTED" | "UNKNOWN";
  source?: string;
}

export interface FridaHook {
  id: string;
  targetClass: string;
  targetMethod: string;
  reason: string;
  script?: string;
}

export interface RuntimeEvent {
  ts: string;
  kind: "SYS" | "CALL" | "NETWORK" | "FILE" | "HOOK";
  message: string;
  detail?: string;
  severity?: Severity;
}

export interface RiskScore {
  score: number; // 0..100
  verdict: Verdict;
  confidence: number; // 0..1
  factors: { label: string; weight: number }[];
}

export interface StaticResult {
  meta: ApkMeta;
  permissions: PermissionFinding[];
  findings: Finding[];
  iocs: IoC[];
  decompiledFiles: string[];
  callGraphEdges?: [string, string][];
}

export interface AiSynthesis {
  summary: string;
  intent: string;
  investigationPlan: string[];
  recommendation: string;
  hooks: FridaHook[];
}

export interface DynamicResult {
  events: RuntimeEvent[];
  confirmedFindings: string[]; // Finding ids validated at runtime
  networkEndpoints: IoC[];
}

export interface AnalysisReport {
  meta: ApkMeta;
  stage: AnalysisStage;
  risk: RiskScore;
  static: StaticResult;
  ai?: AiSynthesis;
  dynamic?: DynamicResult;
  generatedAt: string;
}

export interface ServiceHealth {
  ok: boolean;
  version: string;
  androguard: boolean;
  jadx: boolean;
  frida: boolean;
  llm: boolean;
}
