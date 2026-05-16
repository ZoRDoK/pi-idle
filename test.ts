/**
 * Integration tests for pi-idle.ts extension.
 *
 * Tests:
 * 1.  Module loads and exports a default function
 * 2.  All 4 lifecycle handlers are registered
 * 3.  `session_start` → plain checkmark in title
 * 4.  `input` (interactive) → spinner starts in title
 * 5.  `input` (non-interactive) → no spinner
 * 6.  `agent_end` → checkmark restored, spinner stopped
 * 7.  `session_shutdown` → plain base title
 * 8.  Context ≤50% → no indicator in title
 * 9.  Context >50% → [N%] in title
 * 10. Context ≥90% → ![N%]! in title
 * 11. Context null → no indicator
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

// ── Helpers ──────────────────────────────────────────────────────

function createMockPi(): ExtensionAPI & { _handlers: Map<string, Function> } {
	const handlers = new Map<string, Function>();
	return {
		on: vi.fn((event: string, handler: Function) => {
			handlers.set(event, handler);
		}) as unknown as ExtensionAPI["on"],
		getSessionName: vi.fn(() => null) as unknown as ExtensionAPI["getSessionName"],
		_handlers: handlers,
	} as unknown as ExtensionAPI & { _handlers: Map<string, Function> };
}

function createMockCtx(overrides?: Partial<ExtensionContext>): ExtensionContext {
	const theme = {
		fg: vi.fn((_color: string, text: string) => `«${_color}:${text}»`),
	};
	return {
		ui: {
			theme,
			setTitle: vi.fn(),
			setStatus: vi.fn(),
		} as unknown as ExtensionContext["ui"],
		getContextUsage: vi.fn(() => ({ percent: 25, tokens: 25000, contextWindow: 100000 })),
		hasUI: true,
		...overrides,
	} as ExtensionContext;
}

// ── Module-level tests ───────────────────────────────────────────

describe("pi-idle.ts module", () => {
	it("loads without errors", async () => {
		const mod = await import("./pi-idle.ts");
		expect(typeof mod.default).toBe("function");
	});

	it("registers all four lifecycle handlers", async () => {
		const mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);
		expect(mockPi.on).toHaveBeenCalled();
		const events = new Set(
			(mockPi.on as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0]),
		);
		expect(events.has("session_start")).toBe(true);
		expect(events.has("input")).toBe(true);
		expect(events.has("agent_end")).toBe(true);
		expect(events.has("session_shutdown")).toBe(true);
	});
});

// ── Handler behaviour ────────────────────────────────────────────

describe("extension handlers", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(async () => {
		mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);
	});

	it("session_start: ≤50% context → no indicator in title", async () => {
		const ctx = createMockCtx(); // 25% ≤ 50%
		const handler = mockPi._handlers.get("session_start")!;
		await handler({ reason: "startup" }, ctx);

		expect(ctx.ui.setTitle).toHaveBeenCalledWith("✓ π - pi-idle");
		expect(ctx.ui.setStatus).not.toHaveBeenCalled();
	});

	it("input (interactive) starts spinner in title", async () => {
		const ctx = createMockCtx(); // 25% ≤ 50% → no indicator
		const handler = mockPi._handlers.get("input")!;
		await handler({ source: "interactive", text: "hello" }, ctx);

		await new Promise((r) => setTimeout(r, 150));

		expect(ctx.ui.setTitle).toHaveBeenCalled();
		const firstCall = (ctx.ui.setTitle as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		// Just spinner + base title, no indicator (25% ≤ 50%)
		expect(firstCall).toMatch(/^[◰◳◲◱] π - pi-idle$/);
		expect(ctx.ui.setStatus).not.toHaveBeenCalled();
	});

	it("input (non-interactive) does NOT start spinner", async () => {
		const ctx = createMockCtx();
		const handler = mockPi._handlers.get("input")!;
		await handler({ source: "extension", text: "internal" }, ctx);

		await new Promise((r) => setTimeout(r, 150));
		expect(ctx.ui.setTitle).not.toHaveBeenCalled();
		expect(ctx.ui.setStatus).not.toHaveBeenCalled();
	});

	it("agent_end restores checkmark in title", async () => {
		const ctx = createMockCtx(); // 25% ≤ 50%
		const handler = mockPi._handlers.get("agent_end")!;
		await handler({ messages: [] }, ctx);

		expect(ctx.ui.setTitle).toHaveBeenCalledWith("✓ π - pi-idle");
	});

	it("session_shutdown sets plain base title", async () => {
		const ctx = createMockCtx();
		const handler = mockPi._handlers.get("session_shutdown")!;
		await handler({ reason: "quit" }, ctx);

		expect(ctx.ui.setTitle).toHaveBeenCalledWith("π - pi-idle");
		expect(ctx.ui.setStatus).not.toHaveBeenCalled();
	});
});

// ── Context indicator ────────────────────────────────────────────

describe("context indicator", () => {
	it("≤50%: no indicator in title", async () => {
		const ctx = createMockCtx({
			getContextUsage: () => ({ percent: 50, tokens: 50000, contextWindow: 100000 }),
		});
		const mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);

		const handler = mockPi._handlers.get("session_start")!;
		await handler({ reason: "startup" }, ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("✓ π - pi-idle");
	});

	it(">50% and <90%: shows [N%] in title", async () => {
		const ctx = createMockCtx({
			getContextUsage: () => ({ percent: 63.7, tokens: 63700, contextWindow: 100000 }),
		});
		const mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);

		const handler = mockPi._handlers.get("session_start")!;
		await handler({ reason: "startup" }, ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("✓ [64%] π - pi-idle");
	});

	it("≥90%: shows ![N%]! in title", async () => {
		const ctx = createMockCtx({
			getContextUsage: () => ({ percent: 95, tokens: 95000, contextWindow: 100000 }),
		});
		const mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);

		const handler = mockPi._handlers.get("session_start")!;
		await handler({ reason: "startup" }, ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("✓ ![95%]! π - pi-idle");
	});

	it("context null: no indicator in title", async () => {
		const ctx = createMockCtx({
			getContextUsage: () => null,
		});
		const mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);

		const handler = mockPi._handlers.get("session_start")!;
		await handler({ reason: "startup" }, ctx);
		expect(ctx.ui.setTitle).toHaveBeenCalledWith("✓ π - pi-idle");
	});

	it("spinner never includes context indicator, even at ≥90%", async () => {
		const ctx = createMockCtx({
			getContextUsage: () => ({ percent: 91, tokens: 91000, contextWindow: 100000 }),
		});
		const mockPi = createMockPi();
		const mod = await import("./pi-idle.ts");
		mod.default(mockPi as unknown as ExtensionAPI);

		const handler = mockPi._handlers.get("input")!;
		await handler({ source: "interactive", text: "test" }, ctx);
		await new Promise((r) => setTimeout(r, 150));

		const titleCalls = (ctx.ui.setTitle as ReturnType<typeof vi.fn>).mock.calls;
		const allPlain = titleCalls.every((c: unknown[]) =>
			/^[◰◳◲◱] π - pi-idle$/.test(c[0] as string),
		);
		expect(allPlain).toBe(true);
	});
});
