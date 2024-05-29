import { describe, expect, test } from "vitest";
import { iterableToStream, streamToArray, streamToIterable } from "../utils";
import { StreamSplitter } from "../stream-splitter";

type TestStreamChunk = { type: string; value: string };

const testStream: Array<TestStreamChunk> = [
	{ type: "apple", value: "apple1" },
	{ type: "apple", value: "apple2" },
	{ type: "cherry", value: "cherry1" },
	{ type: "cherry", value: "cherry2" }
];

const expectedResult = [
	{
		type: "apple",
		values: testStream.filter((v) => v.type === "apple")
	},
	{
		type: "cherry",
		values: testStream.filter((v) => v.type === "cherry")
	}
];

describe("StreamSplitter", () => {
	test("sub streams can be consumed when emitted", async () => {
		const stream = iterableToStream(testStream)
			.pipeThrough(new StreamSplitter({
				getNestedStreamProperties: (chunk) => ({ type: chunk.type })
			}));

		let results: typeof expectedResult = [];
		for await (const subStream of streamToIterable(stream)) {
			results.push({
				type: subStream.type,
				values: await streamToArray(subStream)
			});
		}

		expect(results).toEqual(expectedResult);
	});

	test("main stream can be consumed before sub streams", async () => {
		const stream = iterableToStream(testStream)
			.pipeThrough(new StreamSplitter({
				getNestedStreamProperties: (chunk) => ({ type: chunk.type })
			}));

		const subStreams = await streamToArray(stream);
		const results = await Promise.all(subStreams.reverse().map(async (subStream) => {
			return {
				type: subStream.type,
				values: await streamToArray(subStream)
			};
		}));

		expect(results).toEqual([...expectedResult].reverse());
	});

	test("sub stream can be discarded", async () => {
		const stream = iterableToStream(testStream)
			.pipeThrough(new StreamSplitter({
				getNestedStreamProperties: (chunk) => ({ type: chunk.type })
			}));

		let result: TestStreamChunk[] | undefined = undefined;
		for await (const subStream of streamToIterable(stream)) {
			if (subStream.type === "apples") {
				void subStream.cancel();
			} else {
				result = await streamToArray(subStream);
			}
		}

		expect(result).toEqual(testStream.filter((v) => v.type === "cherry"));
	});

	test("abortion is forwarded to all sub streams", async () => {
		const transform = new TransformStream<TestStreamChunk, TestStreamChunk>();

		const writer = transform.writable.getWriter();
		for (const chunk of testStream) {
			writer.write(chunk).catch(() => undefined);
		}

		const stream = transform.readable
			.pipeThrough(new StreamSplitter({
				getNestedStreamProperties: (chunk) => ({ type: chunk.type })
			}));

		const reader = stream.getReader();
		const sub1 = await reader.read();
		const sub2 = await reader.read();

		writer.abort(new Error("test")).catch(() => undefined);

		await expect(async () => await reader.read()).rejects.toThrowError("test");
		await expect(async () => await streamToArray(sub1.value!)).rejects.toThrowError("test");
		await expect(async () => await streamToArray(sub2.value!)).rejects.toThrowError("test");
	});

	test("back pressure is applied", async () => {
		const transform = new TransformStream<TestStreamChunk, TestStreamChunk>();

		const longTestStream = [...testStream, ...testStream, ...testStream];

		let chunksWritten = 0;
		const writer = transform.writable.getWriter();
		void (async () => {
			for (const chunk of longTestStream) {
				await writer.write(chunk);
				chunksWritten++;
			}
			await writer.close();
		})();

		const stream = transform.readable
			.pipeThrough(new StreamSplitter({
				getNestedStreamProperties: (chunk) => ({ type: chunk.type })
			}));

		expect(chunksWritten).toBe(0);

		const reader = stream.getReader();
		await reader.read();

		await new Promise((resolve) => setTimeout(resolve, 0));
		// Each TransformStream in the pipe seems to have a small internal queue by default, so it is difficult to tell
		// how many chunks should have been consumed by now. But as long as not all of them have been consumed, it should
		// be safe to assume that some form of back pressure was applied.
		expect(chunksWritten).toBeLessThan(longTestStream.length);
	});

	test("parent stream can be teed", async () => {
		const [stream1, stream2] = iterableToStream(testStream)
			.pipeThrough(new StreamSplitter({
				getNestedStreamProperties: (chunk) => ({ type: chunk.type })
			})).tee();

		let results1: typeof expectedResult = [];
		for await (const subStream of streamToIterable(stream1)) {
			results1.push({
				type: subStream.type,
				values: await streamToArray(subStream)
			});
		}

		let results2: typeof expectedResult = [];
		for await (const subStream of streamToIterable(stream2)) {
			results2.push({
				type: subStream.type,
				values: await streamToArray(subStream)
			});
		}

		expect(results1).toEqual(expectedResult);
		expect(results2).toEqual(expectedResult);
	});
});