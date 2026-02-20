# Weibo Collection Architecture

## Overview

Weibo collection uses the same architecture as Xiaohongshu with unified data management across all platforms.

## Collection Types

### 1. Search (`search:<keyword>`)
- Collects posts from search results
- Supports pagination
- Mode: fresh/incremental

### 2. Timeline (`timeline:<date>`)
- Collects posts from homepage feed
- Infinite scroll
- Date-based collection ID

### 3. User Monitoring (`user:<userId>:<userName>`)
- Collects posts from specific user profile
- Tracks user activity over time
- User ID + name for human readability

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Weibo Collection                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │ Search          │  │ Timeline        │  │ User        │ │
│  │ Collection      │  │ Collection      │  │ Monitor     │ │
│  └────────┬────────┘  └────────┬────────┘  └──────┬──────┘ │
│           │                    │                   │        │
│           └────────────────────┼───────────────────┘        │
│                                ▼                            │
│                  ┌─────────────────────────┐                │
│                  │  CollectionDataManager  │                │
│                  │                         │                │
│                  │  - Bloom Filter dedupe  │                │
│                  │  - Fresh/Incremental    │                │
│                  │  - File storage         │                │
│                  └───────────┬─────────────┘                │
│                              │                              │
│           ┌──────────────────┼──────────────────┐           │
│           ▼                  ▼                  ▼           │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│    │ Meta JSON   │    │ Posts JSONL │    │ Comments    │   │
│    │             │    │             │    │ JSONL       │   │
│    └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                              │
│  Storage Path: ~/.webauto/download/weibo/<env>/<collection>/ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Collection ID Formats

| Type | Format | Example |
|------|--------|---------|
| Search | `search:<keyword>` | `search:春晚` |
| Timeline | `timeline:<date>` | `timeline:2026-02-20` |
| User | `user:<userId>:<userName>` | `user:1234567890:张三` |

## Collection Modes

### Fresh Mode
- Clears existing data
- Recollects from scratch
- Use for: initial collection, full refresh

### Incremental Mode
- Keeps existing data
- Adds new posts only
- Deduplicates automatically
- Use for: daily updates, monitoring

## File Structure

```
~/.webauto/download/weibo/<env>/<collectionId>/
├── collection-meta.json    # Metadata + bloom filter state
├── posts.jsonl             # Collected posts (one per line)
├── comments.jsonl          # Collected comments
├── links.jsonl             # Original links
├── run.log                 # Execution log
└── run-events.jsonl        # Event stream
```

## Rate Limiting

All operations use `RateLimiter`:
- Search: 2 per 60 seconds per keyword
- Like: 6 per minute
- Comment: 1 per minute, 30 per hour
- Follow: 10 per hour

## Process Management

All blocks use `ProcessRegistry`:
- Heartbeat monitoring
- Graceful shutdown
- No orphan processes

## Usage

```bash
# Search
webauto weibo search --profile xiaohongshu-batch-1 --keyword "春晚" --target 200

# Timeline
webauto weibo timeline --profile xiaohongshu-batch-1 --target 100

# User Monitor
webauto weibo monitor --profile xiaohongshu-batch-1 --user-id 1234567890 --target 50
```
