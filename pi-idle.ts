/**
 * Pi Idle Extension
 *
 * Shows a green checkmark (✓) in the **terminal title** when pi is idle
 * (session finished, waiting for user input). When the user submits
 * a prompt, the checkmark becomes a "square clock" spinner (◰◳◲◱).
 *
 * Context-usage percentage appears beside the checkmark (idle state) in the title:
 *   ≤ 50%  → not shown
 *   > 50%  → [N%]   (e.g. ✓ [63%] π - project)
 *   ≥ 90%  → ![N%]!  (e.g. ✓ ![95%]! π - project)
 * The percentage is captured once when the checkmark is shown; the spinner never displays it.
 *
 * ANSI colours are not supported inside terminal-title OSC sequences,
 * so no colour is attempted there.
 *
 * Usage:
 *   pi -e ./pi-idle.ts
 *   # Or place in ~/.pi/agent/extensions/pi-idle.ts for auto-discovery
 */

import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Spinner frames ──────────────────────────────────────────────

/** "Square clock" — each frame fills a different quadrant of a square. */
const SPINNER_FRAMES = ["◰", "◳", "◲", "◱"];

// ── Base title (mirrors pi's default format) ────────────────────

function getBaseTitle(pi: ExtensionAPI): string {
	const cwd = path.basename(process.cwd());
	const session = pi.getSessionName();

	return session ? `π - ${session} - ${cwd}` : `π - ${cwd}`;
}

// ── Context helpers ─────────────────────────────────────────────

/**
 * Build a context indicator for the title.
 * Returns a string with a leading space if non-empty, otherwise "".
 *   ≤ 50%  → ""
 *   > 50%  → " [N%]"
 *   ≥ 90%  → " ![N%]!"
 */
function getContextIndicator(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const percent = usage?.percent ?? null;

	if (!(percent > 50)) return "";

	const pct = Math.round(percent);
	const formatted = `[${pct}%]`;

	return ` ${percent >= 90 ? `!${formatted}!` : formatted}`;
}

// ── Extension entry point ───────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let timer: ReturnType<typeof setInterval> | null = null;
	let frameIndex = 0;

	// ── Internal helpers ───────────────────────────────────────

	function stopSpinner() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		frameIndex = 0;
	}

	/** Restore idle title with checkmark and context indicator. */
	function restoreTitle(ctx: ExtensionContext) {
		const baseTitle = getBaseTitle(pi);
		const indicator = getContextIndicator(ctx);

		ctx.ui.setTitle(`✓${indicator} ${baseTitle}`);
	}

	function showSpinnerFrame(ctx: ExtensionContext) {
		const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
		const baseTitle = getBaseTitle(pi);

		ctx.ui.setTitle(`${frame} ${baseTitle}`);
		frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
	}

	/** Start the spinner in the title. No context percentage — it only appears with the checkmark. */
	function startSpinner(ctx: ExtensionContext) {
		// Don't restart if already spinning — avoids race conditions and reduces CPU
		if (timer) {
			frameIndex = 0;
			return;
		}

		frameIndex = 0;

		// Show first frame immediately so user sees spinner right away.
		showSpinnerFrame(ctx);

		timer = setInterval(() => {
			showSpinnerFrame(ctx);
		}, 2000);

		// Unref the timer so it doesn't keep the Node.js process alive
		// after pi shuts down.
		(timer as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.();
	}

	// ── Lifecycle hooks ────────────────────────────────────────

	pi.on("session_start", (_event, ctx) => {
		// Defer to after I/O and microtasks so pi's init-based updateTerminalTitle()
		// fires first, then we overwrite it with the checkmark.
		setImmediate(() => restoreTitle(ctx));
	});

	pi.on("input", (_event, ctx) => {
		startSpinner(ctx);
	});

	pi.on("agent_start", (_event, ctx) => {
		// agent_start always fires after input for every user prompt;
		// backstop in case the input handler missed a non-interactive source.
		startSpinner(ctx);
	});

	pi.on("turn_start", (_event, ctx) => {
		// Multi-turn agent: keep spinner running between turns.
		startSpinner(ctx);
	});

	pi.on("agent_end", (_event, ctx) => {
		stopSpinner();
		restoreTitle(ctx);
	});

	pi.on("session_shutdown", (_event, ctx) => {
		stopSpinner();
		ctx.ui.setTitle(getBaseTitle(pi));
	});
}
