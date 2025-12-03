import { readFileSync } from 'fs';
import { join } from 'path';

// process类型已由@types/node提供

function approvedIndexPath(site: string) {
  return join(process.cwd(), 'containers', 'approved', site, 'index.json');
}
function stagingIndexPath(site: string) {
  return join(process.cwd(), 'containers', 'staging', site, 'index.json');
}
// backward-compat names
function validatedIndexPath(site: string) {
  return join(process.cwd(), 'containers', 'validated', site, 'index.json');
}
function testIndexPath(site: string) {
  return join(process.cwd(), 'containers', 'test', site, 'index.json');
}
function legacyIndexPath(site: string) {
  return join(process.cwd(), 'container-system', 'platforms', site, 'index.json');
}

async function loadIndexForSite(site: string) {
  try {
    // prefer approved, then staging, then legacy; also check old names validated/test
    const candidates = [
      approvedIndexPath(site),
      stagingIndexPath(site),
      validatedIndexPath(site),
      testIndexPath(site),
      legacyIndexPath(site),
    ];
    // also try domain-style site (e.g., weibo.com)
    const domainCandidates = [
      approvedIndexPath(site + '.com'),
      stagingIndexPath(site + '.com'),
      validatedIndexPath(site + '.com'),
      testIndexPath(site + '.com'),
    ];
    for (const p of [...candidates, ...domainCandidates]) {
      try {
        const txt = readFileSync(p, 'utf8');
        return JSON.parse(txt);
      } catch {}
    }
    throw new Error('no index found');
  } catch (e: any) {
    throw new Error(`loadIndexForSite failed for ${site}: ${e?.message || e}`);
  }
}

export default { loadIndexForSite };
