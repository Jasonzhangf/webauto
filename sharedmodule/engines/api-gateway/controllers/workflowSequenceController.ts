// @ts-nocheck
export async function run(req, res) {
  try {
    const { sequencePath, sequenceConfig } = req.body || {};
    let runner;
    const { default: SequenceRunner } = await import(`${process.cwd()}/sharedmodule/libraries/workflows/SequenceRunner.js`);
    runner = new SequenceRunner();
    let tmpPath = null;
    if (sequencePath) {
      const out = await runner.runSequence(sequencePath);
      return res.json({ success: !!out?.success, result: out });
    } else if (sequenceConfig) {
      // 写入临时文件后调用（保持现有 SequenceRunner 接口）
      const fs = await import('node:fs');
      const p = `${process.cwd()}/tmp-sequence-${Date.now()}.json`;
      fs.writeFileSync(p, JSON.stringify(sequenceConfig, null, 2)); tmpPath = p;
      const out = await runner.runSequence(p);
      try { fs.unlinkSync(p); } catch {}
      return res.json({ success: !!out?.success, result: out });
    } else {
      return res.status(400).json({ success:false, error:'sequencePath or sequenceConfig required' });
    }
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
}

