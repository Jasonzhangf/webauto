// scripts/xiaohongshu/tests/test-state-api.mjs
// Test script to verify state API integration (webauto-04b)

import fetch from 'node-fetch';

const API_URL = 'http://127.0.0.1:7701';

async function testStateAPI() {
  console.log('[Test] Testing unified state API...');
  
  // 1. Create task
  const runId = `test-run-${Date.now()}`;
  console.log('[Test] Creating task:', runId);
  
  const createRes = await fetch(`${API_URL}/api/v1/tasks/${runId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      runId,
      profileId: 'test-profile',
      keyword: 'test-keyword',
      phase: 'phase2',
      status: 'running',
    }),
  });
  console.log('[Test] Create response:', createRes.status);
  
  // 2. Get task
  const getRes = await fetch(`${API_URL}/api/v1/tasks/${runId}`);
  const task = await getRes.json();
  console.log('[Test] Get task:', task.success ? 'OK' : 'FAILED');
  
  // 3. Update progress
  const progressRes = await fetch(`${API_URL}/api/v1/tasks/${runId}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress: { processed: 5, total: 10 } }),
  });
  console.log('[Test] Update progress:', progressRes.status);
  
  // 4. Push event
  const eventRes = await fetch(`${API_URL}/api/v1/tasks/${runId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'phase_unified_done', data: { notesProcessed: 1 } }),
  });
  console.log('[Test] Push event:', eventRes.status);
  
  // 5. Get all tasks
  const allRes = await fetch(`${API_URL}/api/v1/tasks`);
  const all = await allRes.json();
  console.log('[Test] All tasks count:', all.data?.length || 0);
  
  // 6. Delete task
  const deleteRes = await fetch(`${API_URL}/api/v1/tasks/${runId}`, { method: 'DELETE' });
  console.log('[Test] Delete task:', deleteRes.status);
  
  console.log('[Test] ✓ State API test complete');
}

testStateAPI().catch(err => {
  console.error('[Test] ✗ Failed:', err.message);
  process.exit(1);
});
