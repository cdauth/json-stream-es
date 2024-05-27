import { JsonDeserializer, type JsonValueAndPath } from "./json-deserializer";
import { JsonParser } from "./json-parser";
import { serializeJsonValue, type SerializableJsonValue } from "./json-serializer";
import { JsonStringifier } from "./json-stringifier";
import { JsonPathDetector, type JsonPath } from "./json-path-detector";
import { JsonPathSelector, matchesJsonPathSelector, type JsonPathSelectorExpression } from "./json-path-selector";
import { JsonPathStreamSplitter } from "./json-path-stream-splitter";
import type { JsonValue } from "./types";
import { AbstractTransformStream, PipeableTransformStream } from "./utils";

export function stringifyJsonStream(value: SerializableJsonValue, space?: string | number): ReadableStream<string> {
	return serializeJsonValue(value, space).pipeThrough(new JsonStringifier());
}

class ValueExtractor extends AbstractTransformStream<JsonValueAndPath, JsonValue> {
	protected override transform(chunk: JsonValueAndPath, controller: TransformStreamDefaultController<JsonValue>) {
		controller.enqueue(chunk.value);
	}
}

export function parseJsonStreamWithPaths(
	selector: JsonPathSelectorExpression
): TransformStream<string, JsonValueAndPath> {
	return new PipeableTransformStream((readable) => {
		return readable
			.pipeThrough(new JsonParser())
			.pipeThrough(new JsonPathDetector())
			.pipeThrough(new JsonPathSelector((path) => path.length > 0 && matchesJsonPathSelector(path.slice(0, -1), selector)))
			.pipeThrough(new JsonDeserializer());
	});
}

export function parseJsonStream(
	selector: JsonPathSelectorExpression
): TransformStream<string, JsonValue> {
	return new PipeableTransformStream((readable) => {
		return readable
			.pipeThrough(parseJsonStreamWithPaths(selector))
			.pipeThrough(new ValueExtractor());
	});
}

export function parseJsonStreamAsSubStreamsWithPaths(
	selector: JsonPathSelectorExpression
): TransformStream<string, ReadableStream<JsonValueAndPath> & { path: JsonPath }> {
	return new PipeableTransformStream((readable) => {
		return readable
			.pipeThrough(new JsonParser())
			.pipeThrough(new JsonPathDetector())
			.pipeThrough(new JsonPathSelector(selector))
			.pipeThrough(new JsonPathStreamSplitter())
			.pipeThrough(new TransformStream({
				transform: (chunk, controller) => {
					controller.enqueue(Object.assign(
						chunk
							.pipeThrough(new JsonPathSelector([undefined]))
							.pipeThrough(new JsonDeserializer()),
						{ path: chunk.path }
					));
				}
			}));
	});
}

export function parseJsonStreamAsSubStreams(
	selector: JsonPathSelectorExpression
): TransformStream<string, ReadableStream<JsonValue> & { path: JsonPath }> {
	return new PipeableTransformStream((readable) => {
		return readable
			.pipeThrough(parseJsonStreamAsSubStreamsWithPaths(selector))
			.pipeThrough(new TransformStream({
				transform: (chunk, controller) => {
					controller.enqueue(Object.assign(
						chunk.pipeThrough(new ValueExtractor()),
						{ path: chunk.path }
					));
				}
			}));
	});
}