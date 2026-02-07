#!/usr/bin/env node
import { ensureUtf8Console } from "../lib/cli-encoding.mjs";

ensureUtf8Console();

/**
 * 证据格式规范模板
 *
 * 用途：
 * - 定义统一的证据格式规范
 * - 提供证据收集和写入示例
 * - 供新脚本/任务参考使用
 *
 * 使用方式：
 * 1. 复制本模板到新脚本目录
 * 2. 修改 EVIDENCE_DIR 和 evidence 配置
 * 3. 在关键步骤调用 emitEvent() 和 writeEvidence()
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

// ============ 配置区 ============

const EVIDENCE_DIR = process.env.WEBAUTO_EVIDENCE_DIR || join(homedir(), ".webauto", "evidence");
const TASK_NAME = "template-task";
const ENV = process.env.WEBAUTO_ENV || "debug";

// ============ runId 规范 ============

/**
 * runId 命名规范（符合 webauto-ruz 验收标准）
 *
 * 格式：{TASK}-{YYYYMMDD}-{HHMMSS}-{RANDOM}
 * 示例：phase2-reg-20260206-143921-a3b7c9
 *
 * 规则：
 * - 时间戳使用 ISO 格式（不含 -: 分隔符）
 * - 随机后缀 6 位小写字母/数字（base36 编码）
 * - 全部小写，避免大小写敏感问题
 */
function createRunId(task = TASK_NAME) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const timestamp = `${year}${month}${day}-${hour}${minute}${second}`;
  const rand = randomBytes(3).toString("base64").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6);
  return `${task}-${timestamp}-${rand}`;
}

// ============ 证据收集器 ============

class EvidenceCollector {
  constructor(runId, baseDir) {
    this.runId = runId;
    this.startTime = Date.now();
    this.baseDir = baseDir;
    this.steps = [];
    this.metadata = {};
    this.stats = {};
  }

  addStep(step) {
    this.steps.push({
      ...step,
      timestamp: new Date().toISOString(),
    });
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
  }

  setStats(key, value) {
    this.stats[key] = value;
  }

  async finalize(success, error = null) {
    const duration = Date.now() - this.startTime;
    const timestamp = new Date().toISOString();

    await mkdir(this.baseDir, { recursive: true });

    const evidencePath = join(this.baseDir, "evidence.json");
    const logPath = join(this.baseDir, "run.log");
    const eventsPath = join(this.baseDir, "run-events.jsonl");
    const outputDir = join(this.baseDir, "output");
    const screenshotDir = join(this.baseDir, "screenshots");

    const evidence = {
      runId: this.runId,
      taskName: TASK_NAME,
      timestamp,
      env: ENV,
      success,
      duration,
      error,
      paths: {
        logPath,
        eventsPath,
        evidencePath,
        outputDir,
        screenshotDir,
      },
      steps: this.steps,
      metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
      stats: Object.keys(this.stats).length > 0 ? this.stats : undefined,
    };

    await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    console.log(`\n[Evidence] Written: ${evidencePath}`);
    console.log(`[Evidence] runId: ${this.runId}`);
    console.log(`[Evidence] success: ${success ? "✅" : "❌"}`);
    if (error) console.log(`[Evidence] error: ${error}`);
    console.log(`[Evidence] duration: ${duration}ms`);

    return evidence;
  }
}

// ============ 使用示例 ============

async function main() {
  const runId = createRunId();
  const baseDir = join(EVIDENCE_DIR, TASK_NAME, ENV, runId);
  const collector = new EvidenceCollector(runId, baseDir);

  console.log(`=== Evidence Template Demo ===`);
  console.log(`Run ID: ${runId}`);
  console.log(`Base Dir: ${baseDir}`);

  collector.addStep({
    id: "step-1",
    status: "success",
    data: { message: "示例步骤 1" },
  });

  collector.addStep({
    id: "step-2",
    status: "failed",
    error: "示例错误",
  });

  collector.setMetadata("testKey", "testValue");
  collector.setStats("itemsProcessed", 42);

  const evidence = await collector.finalize(false, "示例失败");

  console.log(`\n=== Demo Complete ===`);
  console.log(`Evidence Path: ${evidence.paths.evidencePath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { EvidenceCollector };
export { createRunId };
