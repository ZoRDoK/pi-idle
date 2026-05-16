# pi-done

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that puts a **✓ checkmark** in your terminal title when the agent is idle, and a **◰◳◲◱ spinner** while it's working — so you can tell at a glance whether pi is done or still thinking.

## Title format

| State | Title |
|---|---|
| Idle (≤ 50 % context) | `✓ π - session - project` |
| Idle (> 50 % context) | `✓ [63%] π - session - project` |
| Idle (≥ 90 % context) | `✓ ![95%]! π - session - project` |
| Working | `◰ π - session - project` |
| Shutdown | `π - session - project` |

- The context-usage percentage is shown **only** beside the checkmark — never during the spinner. It's captured once when the agent finishes, not updated live.
- `≤ 50 %` → percentage hidden; `> 50 %` → `[N%]`; `≥ 90 %` → `![N%]!` (high-usage warning).
- ANSI colours don't work inside terminal-title OSC sequences, so everything is plain text.

## Install

```sh
# One-off run
pi -e ./pi-done.ts

# Auto-discovery: drop into your extensions directory
cp pi-done.ts ~/.pi/agent/extensions/pi-done.ts
```

## Test

```sh
npm test        # single run
npm run test:watch  # watch mode
```

CI runs on every push / PR to `master` via GitHub Actions.

## License

[MIT](LICENSE)