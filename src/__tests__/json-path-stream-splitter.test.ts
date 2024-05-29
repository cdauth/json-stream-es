import { expect, test } from "vitest";
import { iterableToStream, streamToIterable, streamToString } from "../utils";
import { JsonParser } from "../json-parser";
import { JsonPathDetector, type JsonPath } from "../json-path-detector";
import { JsonPathSelector } from "../json-path-selector";
import { JsonPathStreamSplitter } from "../json-path-stream-splitter";
import { JsonStringifier } from "../json-stringifier";

const testStream = [
	`{"apples":{"results":[`,
	`"apple1",`,
	`"apple2"`,
	`]},"cherries":{"results":{`,
	`"1":"cherry1",`,
	`"2":"cherry2"`,
	`}}}`
];

const testResult = JSON.parse(testStream.join(""));

test("JsonPathStreamSplitter", async () => {
	const stream = iterableToStream(testStream)
		.pipeThrough(new JsonParser())
		.pipeThrough(new JsonPathDetector())
		.pipeThrough(new JsonPathSelector([undefined, "results"]))
		.pipeThrough(new JsonPathStreamSplitter());

	let results: Array<{ path: JsonPath; string: string }> = [];
	for await (const subStream of streamToIterable(stream)) {
		results.push({
			path: subStream.path,
			string: await streamToString(subStream.pipeThrough(new JsonStringifier()))
		});
	}

	expect(results).toEqual([
		{
			path: ["apples", "results"],
			string: JSON.stringify(testResult.apples.results)
		},
		{
			path: ["cherries", "results"],
			string: JSON.stringify(testResult.cherries.results)
		}
	]);
});