import { expect, test } from "vitest";
import { readFile } from "fs/promises";
import { createReadStream } from "fs";
import { Readable } from "stream";
import { JsonParser } from "../json-parser";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { JsonChunkType, StringRole, colon, comma, objectEnd, objectStart, stringChunk, stringEnd, stringStart, whitespace, type JsonChunk } from "../types";
import { JsonStringifier } from "../json-stringifier";
import { streamToArray } from "../utils";

test("JsonParseStream–JsonStringifyStream round trip", async () => {
	const jsonFileStream = Readable.toWeb(createReadStream(new URL("./basic.json", import.meta.url), "utf8")) as ReadableStream<string>;
	const parseStream = jsonFileStream.pipeThrough(new JsonParser());
	const stringifyStream = parseStream.pipeThrough(new JsonStringifier());

	let result = "";
	for await (const chunk of stringifyStream as NodeReadableStream<JsonChunk>) {
		result += chunk;
	}

	const jsonFile = await readFile(new URL("./basic.json", import.meta.url), "utf8");
	expect(result).toEqual(jsonFile);
});

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