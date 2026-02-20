import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CollectionDataManager, buildCollectionId } from './index.js';
import type { PostRecord, CommentRecord } from './types.js';

async function setupTestDir(): Promise<string> {
  const testDir = path.join(os.tmpdir(), `webauto-test-${Date.now()}`);
  await fs.promises.mkdir(testDir, { recursive: true });
  return testDir;
}

async function cleanupTestDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

test('CollectionDataManager: fresh mode clears existing data', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'test' },
      mode: 'fresh',
      baseDir: testDir
    });
    
    await dm.init();
    
    await dm.addPost({
      id: 'post1',
      url: 'https://weibo.com/1',
      collectedAt: new Date().toISOString()
    });
    
    await dm.persist();
    
    const dm2 = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'test' },
      mode: 'fresh',
      baseDir: testDir
    });
    
    await dm2.init();
    
    const stats = dm2.getStats();
    assert.equal(stats.totalPosts, 0, 'Fresh mode should clear existing posts');
    assert.equal(stats.newPosts, 0, 'Fresh mode should reset new posts counter');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('CollectionDataManager: incremental mode deduplicates', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'test' },
      mode: 'incremental',
      baseDir: testDir
    });
    
    await dm.init();
    
    await dm.addPost({ id: 'post1', url: 'https://weibo.com/1', collectedAt: '' });
    await dm.persist();
    
    // Same manager instance: duplicate check via bloom filter
    const added1 = await dm.addPost({ id: 'post1', url: 'https://weibo.com/1', collectedAt: '' });
    assert.equal(added1, false, 'Duplicate in same instance should be skipped');
    
    const added2 = await dm.addPost({ id: 'post2', url: 'https://weibo.com/2', collectedAt: '' });
    assert.equal(added2, true, 'New post should be added');
    
    const stats = dm.getStats();
    assert.equal(stats.totalPosts, 2, 'Should have 2 total posts');
    assert.equal(stats.duplicatesSkipped, 1, 'Should have 1 duplicate skipped');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('CollectionDataManager: bloom filter persists across sessions', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm1 = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'persist' },
      mode: 'incremental',
      baseDir: testDir
    });
    
    await dm1.init();
    await dm1.addPost({ id: 'post1', url: 'https://weibo.com/1', collectedAt: '' });
    await dm1.persist();
    
    // New session loads bloom filter from meta
    const dm2 = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'persist' },
      mode: 'incremental',
      baseDir: testDir
    });
    
    await dm2.init();
    
    const hasPost = dm2.hasPost('post1');
    assert.equal(hasPost, true, 'Bloom filter should recognize existing post');
    
    const added = await dm2.addPost({ id: 'post1', url: 'https://weibo.com/1', collectedAt: '' });
    assert.equal(added, false, 'Duplicate across sessions should be skipped');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('CollectionDataManager: auto-fills timestamp fields', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'test' },
      baseDir: testDir
    });
    
    await dm.init();
    
    await dm.addPost({ id: 'post1', url: 'https://weibo.com/1', collectedAt: '' });
    await dm.persist();
    
    const postsPath = dm.getPaths().postsPath;
    const content = await fs.promises.readFile(postsPath, 'utf-8');
    const post: PostRecord = JSON.parse(content.trim());
    
    assert.ok(post.collectedAt, 'collectedAt should be auto-filled');
    assert.ok(post.collectedAtLocal, 'collectedAtLocal should be auto-filled');
    assert.ok(post.collectedDate, 'collectedDate should be auto-filled');
    assert.ok(post.collectedAt.endsWith('Z'), 'collectedAt should be ISO format');
    assert.ok(/\+08:00|GMT\+8/.test(post.collectedAtLocal || ''), 'collectedAtLocal should have timezone');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('CollectionDataManager: user collection ID with name', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'user', userId: '123456', userName: '张三' },
      baseDir: testDir
    });
    
    await dm.init();
    
    const collectionId = dm.getCollectionId();
    assert.equal(collectionId, 'user:123456:张三', 'Collection ID should include user name');
    
    const paths = dm.getPaths();
    assert.ok(paths.collectionDir.includes('user:123456:张三'), 'Directory should include user name');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('CollectionDataManager: timeline collection ID with date', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'timeline', date: '2026-02-20' },
      baseDir: testDir
    });
    
    await dm.init();
    
    const collectionId = dm.getCollectionId();
    assert.equal(collectionId, 'timeline:2026-02-20', 'Collection ID should include date');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('CollectionDataManager: add and retrieve comments', async () => {
  const testDir = await setupTestDir();
  
  try {
    const dm = new CollectionDataManager({
      platform: 'weibo',
      env: 'test',
      spec: { source: 'search', keyword: 'test' },
      baseDir: testDir
    });
    
    await dm.init();
    
    const comment: CommentRecord = {
      id: 'comment1',
      postId: 'post1',
      authorName: '李四',
      content: '这是一条评论',
      collectedAt: new Date().toISOString()
    };
    
    const added = await dm.addComment(comment);
    assert.equal(added, true, 'Comment should be added');
    
    const added2 = await dm.addComment(comment);
    assert.equal(added2, false, 'Duplicate comment should not be added');
    
    const stats = dm.getStats();
    assert.equal(stats.totalComments, 1, 'Should have 1 total comment');
    assert.equal(stats.newComments, 1, 'Should have 1 new comment');
  } finally {
    await cleanupTestDir(testDir);
  }
});

test('buildCollectionId: search keyword', () => {
  const id = buildCollectionId({ source: 'search', keyword: '春晚' });
  assert.equal(id, 'search:春晚');
});

test('buildCollectionId: user with name sanitization', () => {
  const id = buildCollectionId({ source: 'user', userId: '123', userName: '张/三:李四' });
  assert.equal(id, 'user:123:张_三_李四', 'Special chars should be sanitized');
});

test('buildCollectionId: product keyword', () => {
  const id = buildCollectionId({ source: 'product', keyword: '女装' });
  assert.equal(id, 'product:女装');
});

console.log('Running CollectionDataManager tests...');
