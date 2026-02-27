import type { PackageMetadata, VulnInfo } from "./security-scanner.js";

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "UNKNOWN";

export interface TrustScore {
  score: number;
  riskLevel: RiskLevel;
}

// Scoring weights (must sum to 1.0)
const WEIGHT_VULNS = 0.3;
const WEIGHT_DOWNLOADS = 0.2;
const WEIGHT_AGE = 0.15;
const WEIGHT_PUBLISH_FREQ = 0.15;
const WEIGHT_MAINTAINERS = 0.2;

// Vulnerability sub-score: deduct per severity
function vulnScore(vulns: VulnInfo[]): number {
  let score = 100;
  for (const v of vulns) {
    if (v.severity === "critical") score -= 25;
    else if (v.severity === "high") score -= 15;
    else if (v.severity === "moderate") score -= 10;
    else score -= 5;
  }
  return Math.max(0, score);
}

// Download sub-score: log scale 0-100
function downloadScore(weeklyDownloads: number): number {
  if (weeklyDownloads <= 0) return 0;
  if (weeklyDownloads >= 1_000_000) return 100;
  if (weeklyDownloads >= 100_000) return 80;
  if (weeklyDownloads >= 10_000) return 60;
  if (weeklyDownloads >= 1_000) return 40;
  if (weeklyDownloads >= 100) return 20;
  return 10;
}

// Age sub-score: days since first publish
function ageScore(packageAge: number): number {
  if (packageAge <= 0) return 0;
  if (packageAge >= 730) return 100; // 2 years+
  if (packageAge >= 365) return 80;
  if (packageAge >= 180) return 60;
  if (packageAge >= 30) return 30;
  return 10;
}

// Publish frequency sub-score: recency of last publish
function publishScore(lastPublish: string): number {
  const daysSince = Math.floor((Date.now() - new Date(lastPublish).getTime()) / 86_400_000);
  if (daysSince <= 30) return 100;
  if (daysSince <= 90) return 80;
  if (daysSince <= 180) return 60;
  if (daysSince <= 365) return 40;
  return 20;
}

// Maintainer signal sub-score
function maintainerScore(count: number, deprecated: boolean): number {
  let score = 0;
  if (count >= 3) score = 90;
  else if (count === 2) score = 70;
  else score = 50; // 1 maintainer
  if (!deprecated) score += 10;
  return Math.min(100, score);
}

// Map numeric score to risk level
function toRiskLevel(score: number): RiskLevel {
  if (score >= 80) return "LOW";
  if (score >= 50) return "MEDIUM";
  if (score >= 20) return "HIGH";
  return "CRITICAL";
}

// Main export: compute weighted trust score from metadata + vulns
export function computeTrustScore(metadata: PackageMetadata | null, vulns: VulnInfo[]): TrustScore {
  // No metadata available (non-npm or fetch failed)
  if (!metadata) {
    const vScore = vulnScore(vulns);
    const score = Math.round(vScore * WEIGHT_VULNS * 100) / 100;
    return { score: Math.round(score), riskLevel: toRiskLevel(score) };
  }

  const scores = {
    vulns: vulnScore(vulns),
    downloads: downloadScore(metadata.weeklyDownloads),
    age: ageScore(metadata.packageAge),
    publish: publishScore(metadata.lastPublish),
    maintainers: maintainerScore(metadata.maintainerCount, metadata.deprecated),
  };

  const weighted =
    scores.vulns * WEIGHT_VULNS +
    scores.downloads * WEIGHT_DOWNLOADS +
    scores.age * WEIGHT_AGE +
    scores.publish * WEIGHT_PUBLISH_FREQ +
    scores.maintainers * WEIGHT_MAINTAINERS;

  const score = Math.min(100, Math.max(0, Math.round(weighted)));
  return { score, riskLevel: toRiskLevel(score) };
}
