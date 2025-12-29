# WebSocket API (Unified)

This document defines the unified WebSocket command/event contract for browser control,
DOM inspection, highlighting, and user operations. All messages are JSON.

## Envelope

### Command (Client -> Server)

```json
{
  "type": "command",
  "request_id": "uuid-or-client-id",
  "session_id": "session-id",
  "data": {
    "command_type": "browser_state | page_control | dom_operation | user_action | highlight | container_operation",
    "action": "string",
    "parameters": {
      "...": "..."
    }
  }
}
```

### Response (Server -> Client)

```json
{
  "type": "response",
  "request_id": "uuid-or-client-id",
  "session_id": "session-id",
  "data": {
    "success": true,
    "error": "string?",
    "data": {}
  }
}
```

### Event (Server -> Client)

```json
{
  "type": "event",
  "topic": "string",
  "session_id": "session-id",
  "data": {}
}
```

### Subscribe (Client -> Server)

Client subscribes to specific event topics.

```json
{
  "type": "subscribe",
  "request_id": "uuid",
  "session_id": "session-id",
  "data": {
    "topics": ["dom.updated", "page.navigated", "container.matched"]
  }
}
```

### Unsubscribe (Client -> Server)

```json
{
  "type": "unsubscribe",
  "request_id": "uuid",
  "session_id": "session-id",
  "data": {
    "topics": ["dom.updated"]
  }
}
```

## Event Topics

### Browser Events

- `browser.session.created` - New session created
- `browser.session.closed` - Session closed
- `browser.session.error` - Session error

### Page Events

- `page.navigated` - Page navigation completed
  ```json
  { "url": "https://...", "title": "..." }
  ```

- `page.loaded` - Page load completed
  ```json
  { "url": "https://...", "load_time_ms": 1234 }
  ```

### DOM Events

- `dom.updated` - DOM tree updated
  ```json
  { "root_path": "root", "change_count": 5 }
  ```

- `dom.picker.started` - DOM picker started
- `dom.picker.result` - DOM picker completed
  ```json
  { "success": true, "dom_path": "root/1/2", "selector": "..." }
  ```

### Container Events

- `container.matched` - Container matched
  ```json
  { "container_id": "weibo_main_page", "match_count": 3 }
  ```

- `container.match.failed` - Container match failed
  ```json
  { "error": "no matching selector", "url": "..." }
  ```

### User Action Events

- `user_action.completed` - User action completed
  ```json
  { "action": "click", "target": "...", "duration_ms": 120 }
  ```

### Highlight Events

- `highlight.updated` - Highlight state changed
  ```json
  { "channel": "dom", "count": 3, "style": "green" }
  ```

## Commands

### 1) browser_state

#### list

```json
{
  "command_type": "browser_state",
  "action": "list"
}
```

#### info

```json
{
  "command_type": "browser_state",
  "action": "info",
  "parameters": { "session_id": "..." }
}
```

#### create

```json
{
  "command_type": "browser_state",
  "action": "create",
  "parameters": {
    "browser_config": {
      "profile_id": "profile",
      "headless": false,
      "initial_url": "https://...",
      "viewport": { "width": 1440, "height": 900 },
      "user_agent": "..."
    },
    "capabilities": ["dom", "highlight", "user_action"]
  }
}
```

#### delete

```json
{
  "command_type": "browser_state",
  "action": "delete",
  "parameters": { "session_id": "..." }
}
```

### 2) page_control

#### navigate

```json
{
  "command_type": "page_control",
  "action": "navigate",
  "parameters": { "url": "https://..." }
}
```

#### screenshot

```json
{
  "command_type": "page_control",
  "action": "screenshot",
  "parameters": {
    "filename": "capture.png",
    "full_page": true
  }
}
```

### 3) dom_operation

#### dom_full

Full DOM snapshot for the current page.

```json
{
  "command_type": "dom_operation",
  "action": "dom_full",
  "parameters": {
    "root_selector": "#app",
    "max_depth": 8
  }
}
```

#### dom_branch

DOM subtree for a given xpath (dom_path).

```json
{
  "command_type": "dom_operation",
  "action": "dom_branch",
  "parameters": {
    "dom_path": "root/1/2/0",
    "depth": 3,
    "root_selector": "#app"
  }
}
```

#### pick_dom

```json
{
  "command_type": "dom_operation",
  "action": "pick_dom",
  "parameters": {
    "root_selector": "#app",
    "timeout": 20000
  }
}
```

### 4) user_action

#### operation

```json
{
  "command_type": "user_action",
  "action": "operation",
  "parameters": {
    "operation_type": "click | type | scroll | move | down | up | key",
    "target": {
      "selector": "...",
      "dom_path": "root/...",
      "offset": { "x": 0, "y": 0 }
    },
    "text": "...",
    "deltaY": 120,
    "key": "Enter"
  }
}
```

### 5) highlight

#### element

```json
{
  "command_type": "highlight",
  "action": "element",
  "parameters": {
    "selector": "div.foo",
    "root_selector": "#app",
    "channel": "dom",
    "style": "green | red | orange-dash | orange",
    "sticky": true
  }
}
```

#### dom_path

```json
{
  "command_type": "highlight",
  "action": "dom_path",
  "parameters": {
    "path": "root/1/2/0",
    "root_selector": "#app",
    "channel": "dom",
    "style": "orange"
  }
}
```

### 6) container_operation

#### match_root

```json
{
  "command_type": "container_operation",
  "action": "match_root",
  "parameters": {
    "page_context": { "url": "https://..." }
  }
}
```

#### inspect_tree

```json
{
  "command_type": "container_operation",
  "action": "inspect_tree",
  "parameters": {
    "page_context": { "url": "https://..." }
  }
}
```

#### inspect_dom_branch

```json
{
  "command_type": "container_operation",
  "action": "inspect_dom_branch",
  "parameters": {
    "page_context": { "url": "https://..." },
    "dom_path": "root/...",
    "depth": 3
  }
}
```

## DOM Snapshot Structure

```json
{
  "path": "root/1/2/0",
  "tag": "div",
  "id": "...",
  "classes": ["..."],
  "text": "...",
  "children": ["root/1/2/0/0", "root/1/2/0/1"]
}
```

The DOM snapshot structure returned by `dom_full` and `dom_branch` operations:

```json
{
  "path": "root/1/2/0",
  "tag": "div",
  "id": "...",
  "classes": ["..."],
  "text": "...",
  "childCount": 2,
  "children": [
    {
      "path": "root/1/2/0/0",
      "tag": "span",
      "id": null,
      "classes": ["text-content"],
      "text": "Hello World",
      "childCount": 0
    },
    {
      "path": "root/1/2/0/1", 
      "tag": "button",
      "id": "btn-submit",
      "classes": ["btn", "primary"],
      "text": "Submit",
      "childCount": 0
    }
  ]
}
```

### Full DOM Response

```json
{
  "success": true,
  "data": {
    "root_path": "root",
    "node_count": 156,
    "snapshot": { /* DOM tree structure */ }
  }
}
```

### Branch DOM Response

```json
{
  "success": true,
  "data": {
    "path": "root/1/2",
    "node_count": 12,
    "children": [ /* array of child nodes */ ]
  }
}
```

## Notes

- All DOM paths are absolute and anchored to the current root selector.
- All highlight operations use the same underlying runtime; only style and channel differ.
- Use `dom_full` first, then `dom_branch` for incremental refresh.
- Clients can subscribe to event topics to receive push notifications.
- Events are broadcast to all subscribed clients for a session.
- Subscriptions are per-connection and cleared on disconnect.
