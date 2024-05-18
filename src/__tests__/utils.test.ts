import { describe, expect, test, vi } from "vitest";
import { AbortHandlingTransformStream } from "../utils";

describe("AbortHandlingTransformStream", () => {

	test("success", async () => {
		const abort = vi.fn();
		const transform = new AbortHandlingTransformStream({ abort });

		const writer = transform.writable.getWriter();
		const reader = transform.readable.getReader();

		void writer.write("test1");
		expect(await reader.read()).toEqual({ done: false, value: "test1" });

		void writer.write("test2");
		expect(await reader.read()).toEqual({ done: false, value: "test2" });

		void writer.close();
		expect(await reader.read()).toEqual({ done: true });

		expect(abort).toBeCalledTimes(0);
	});

	test("abort input", async () => {
		const transform = new AbortHandlingTransformStream();

		const writer = transform.writable.getWriter();
		const reader = transform.readable.getReader();

		const reason = new Error("test1");
		void writer.abort(reason);

		await expect(async () => await reader.read()).rejects.toThrowError("test1");
	});

	test("ErrorTransform transformed error", async () => {
		const abort = vi.fn(async () => {
			throw new Error("test2");
		});
		const transform = new AbortHandlingTransformStream({ abort });

		const writer = transform.writable.getWriter();
		const reader = transform.readable.getReader();

		const reason = new Error("test1");
		void writer.abort(reason);

		await expect(async () => await reader.read()).rejects.toThrowError("test2");
		expect(abort).toBeCalledTimes(1);
		expect(abort).toBeCalledWith(reason, expect.anything());
	});

	test("exception in abort function", async () => {
		const transform = new AbortHandlingTransformStream({
			abort: (reason, controller) => {
				controller.error(new Error("test2"));
			}
		});

		const writer = transform.writable.getWriter();
		const reader = transform.readable.getReader();

		const reason = new Error("test1");
		void writer.abort(reason);

		await expect(async () => await reader.read()).rejects.toThrowError("test2");
		// expect(abort).toBeCalledTimes(1);
		// expect(abort).toBeCalledWith(reason, expect.anything());
	});

});