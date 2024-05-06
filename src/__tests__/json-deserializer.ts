import { expect, test } from "vitest";
import { concatStreams, iteratorToStream, streamToArray, stringToStream } from "../utils";
import { ValueAggregator } from "../json-deserializer";
import JsonParser from "../json-parser";

test("JsonDeserializer", async () => {
	const values = [
		null,
		1.2,
		false,
		true,
		"test",
		{ key1: [{ key2: "value2", key3: "value3" }] },
		["test1", { key2: "value2" }]
	];

	const stream = concatStreams(
		...values.map((v) => stringToStream(JSON.stringify(v)).pipeThrough(new JsonParser()))
	).pipeThrough(new ValueAggregator());

	expect(await streamToArray(stream)).toEqual(values);
});