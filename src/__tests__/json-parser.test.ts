import { expect, test } from "vitest";
import { JsonParser } from "../json-parser";
import { JsonChunkType, StringRole, colon, comma, objectEnd, objectStart, stringChunk, stringEnd, stringStart, whitespace } from "../types";
import { streamToArray } from "../utils";

test("empty object", async () => {
	const transform = new TransformStream<string, string>();
	const writer = transform.writable.getWriter();
	writer.write("{");
	writer.write("}");
	writer.close();

	const chunks = await streamToArray(transform.readable.pipeThrough(new JsonParser()));
	expect(chunks).toEqual([
		{ type: JsonChunkType.OBJECT_START, rawValue: "{" },
		{ type: JsonChunkType.OBJECT_END, rawValue: "}" }
	]);
});

test("object", async () => {
	const transform = new TransformStream<string, string>();
	const writer = transform.writable.getWriter();
	writer.write("{\"key");
	writer.write(" 1\": \"value");
	writer.write(" 1\", \"key 2\": \"value 2\"}");
	writer.close();

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