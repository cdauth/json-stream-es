import { JsonDeserializer, type JsonValueAndPath } from "./json-deserializer";
import { JsonParser } from "./json-parser";
import { JsonSerializer, type SerializableJsonValue } from "./json-serializer";
import { JsonStringifier } from "./json-stringifier";
import { PathSelector, type JsonChunkWithPath, type PathSelectorExpression } from "./path-selector";
import { PipeableTransformStream } from "./utils";

export function generateJsonStream(value: SerializableJsonValue, space?: string | number): ReadableStream<string> {
	return new JsonSerializer(value, space).pipeThrough(new JsonStringifier());
}

export function parseJsonStream(selector: PathSelectorExpression): TransformStream<string, JsonValueAndPath<JsonChunkWithPath>> {
	return new PipeableTransformStream((readable) => (
		readable
			.pipeThrough(new JsonParser())
			.pipeThrough(new PathSelector(selector))
			.pipeThrough(new JsonDeserializer())
	));
}