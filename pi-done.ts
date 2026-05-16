/**
 * Pi Done Extension
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
 *   pi -e ./pi-done.ts
 *   # Or place in ~/.pi/agent/extensions/pi-done.ts for auto-discovery
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
 *   ≤ 50%  → ""           (hidden)
 *   > 50%  → "[N%]"
 *   ≥ 90%  → "![N%]!"
 */
function getContextIndicator(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const percent = usage?.percent ?? null;
	if (percent === null || percent <= 50) return "";
	const pct = Math.round(percent);
	if (percent >= 90) return `![${pct}%]!`;
	return `[${pct}%]`;
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

	/** Write the idle title (plain text — colours don't work in OSC titles). */
	function showDone(ctx: ExtensionContext) {
		stopSpinner();
		const baseTitle = getBaseTitle(pi);
		const indicator = getContextIndicator(ctx);
		const spacer = indicator ? " " : "";
		ctx.ui.setTitle(`✓${spacer}${indicator} ${baseTitle}`);
	}

	/** Start the spinner in the title. No context percentage — it only appears with the checkmark. */
	function startSpinner(ctx: ExtensionContext) {
		stopSpinner();

		timer = setInterval(() => {
			const frame = SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length];
			const baseTitle = getBaseTitle(pi);
			ctx.ui.setTitle(`${frame} ${baseTitle}`);
			frameIndex++;
		}, 120);
	}

	// ── Lifecycle hooks ────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		showDone(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "interactive") {
			startSpinner(ctx);
		}
	});

	pi.on("agent_end", async (_event, ctx) => {
		showDone(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		stopSpinner();
		ctx.ui.setTitle(getBaseTitle(pi));
	})
}
