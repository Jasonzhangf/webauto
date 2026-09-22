# Weibo Migration Matrix

| Existing capability | Existing entry | v3 owner | Compatibility |
| --- | --- | --- | --- |
| Keyword search list | `weibo collect`, `weibo unified --task-type search` | `weibo-v3/search` | same command names |
| Timeline list | `weibo unified --task-type timeline`, `weibo-timeline` | `weibo-v3/timeline` | same command names |
| User profile list | `weibo unified --task-type user-profile`, `weibo-user-profile` | `weibo-v3/profile` | same command names |
| Post detail/content/media | `weibo detail` | `weibo-v3/detail` | same command names |
| Comments and replies | `weibo detail` | `weibo-v3/comments` | same artifact families |
| Video URL resolution | `weibo video` | `weibo-v3/video` | same command name |
| Producer | `weibo-producer` | workflow `producer` | same command name |
| Consumer | `weibo-consumer` | workflow `consumer` | same command name |
| Watch | `weibo-watch` | workflow `watch` | same command name |
| Special follow monitor | `weibo-special-follow-monitor` | workflow `special-follow` | same command name |

## Retired control paths

The old `weibo-unified-runner`, `weibo-collect-runner`,
`weibo-detail-runner`, `weibo-user-profile-runner`, producer, consumer, and
special-follow monitor stop owning orchestration. Entries forward to
`apps/webauto/weibo-v3/cli.mjs`.

## Preserved data

Historical files remain in place:

- `posts.jsonl`;
- `links.jsonl`;
- `comments.jsonl`;
- `collection-meta.json`;
- `detail-meta.json`;
- `new-posts.jsonl`;
- event/run logs.

New control events go under:

```text
~/.webauto/state/webauto-v3/<run_id>/events.jsonl
```

Business artifacts continue under their existing Weibo download directories.

## Migration evidence

Each capability is migrated only when:

1. its old command name resolves to the v3 entry;
2. its page/workflow DAG emits typed events;
3. its artifact contract is validated;
4. the old runner is no longer imported by the active entry.
