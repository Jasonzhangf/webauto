#!/usr/bin/env node
/**
 * quota-status.mjs - CLI tool to get rate limiter status
 */

import { RateLimiter } from '../../../../dist/modules/rate-limiter/index.js';

async function main() {
  const limiter = RateLimiter.getInstance();
  await limiter.init();
  
  const status = limiter.getStatus();
  
  console.log(JSON.stringify({
    ok: true,
    quotas: status
  }));
}

main().catch(err => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
