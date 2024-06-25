import { expect, test } from "vitest";
import { JsonParser } from "../json-parser.ts";
import { JsonChunkType, StringRole, colon, comma, objectEnd, objectStart, stringChunk, stringEnd, stringStart, whitespace } from "../types.ts";
import { streamToArray } from "../utils.ts";

test("empty object", async () => {
	const transform = new TransformStream<string, string>();
	const writer = transform.writable.getWriter();
	void writer.write("{");
	void writer.write("}");
	void writer.close();

	const chunks = await streamToArray(transform.readable.pipeThrough(new JsonParser()));
	expect(chunks).toEqual([
		{ type: JsonChunkType.OBJECT_START, rawValue: "{" },
		{ type: JsonChunkType.OBJECT_END, rawValue: "}" }
	]);
});

test("object", async () => {
	const transform = new TransformStream<string, string>();
	const writer = transform.writable.getWriter();
	void writer.write("{\"key");
	void writer.write(" 1\": \"value");
	void writer.write(" 1\", \"key 2\": \"value 2\"}");
	void writer.close();

	const chunks = await streamToArray(transform.readable.pipeThrough(new JsonParser()));
	expect(chunks).toEqual([
		objectStart(),
		stringStart(StringRole.KEY),
		stringChunk("key", StringRole.KEY),
		stringChunk(" 1", StringRole.KEY),
		stringEnd(StringRole.KEY),
		colon(),
		whitespace(" "),
		stringStart(StringRole.VALUE),
		stringChunk("value", StringRole.VALUE),
		stringChunk(" 1", StringRole.VALUE),
		stringEnd(StringRole.VALUE),
		comma(),
		whitespace(" "),
		stringStart(StringRole.KEY),
		stringChunk("key 2", StringRole.KEY),
		stringEnd(StringRole.KEY),
		colon(),
		whitespace(" "),
		stringStart(StringRole.VALUE),
		stringChunk("value 2", StringRole.VALUE),
		stringEnd(StringRole.VALUE),
		objectEnd()
	]);
});