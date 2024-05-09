import { JsonDeserializer, type JsonValueAndPath } from "./json-deserializer";
import { JsonParser } from "./json-parser";
import { JsonSerializer, type SerializableJsonValue } from "./json-serializer";
import { JsonStringifier } from "./json-stringifier";
import { PathSelector, type JsonChunkWithPath, type PathSelectorExpression } from "./path-selector";
import type { JsonValue } from "./types";
import { PipeableTransformStream } from "./utils";

export function generateJsonStream(value: SerializableJsonValue, space?: string | number): ReadableStream<string> {
	return new JsonSerializer(value, space).pipeThrough(new JsonStringifier());
}

export function parseJsonStream<EmitPath extends boolean = false>(
	selector: PathSelectorExpression,
	options?: { emitPath?: EmitPath }
): TransformStream<string, EmitPath extends true ? JsonValueAndPath<JsonChunkWithPath> : JsonValue> {
	return new PipeableTransformStream((readable) => {
		const stream = readable
			.pipeThrough(new JsonParser())
			.pipeThrough(new PathSelector(selector))
			.pipeThrough(new JsonDeserializer());

		if (options?.emitPath) {
			return stream as ReadableStream<EmitPath extends true ? JsonValueAndPath<JsonChunkWithPath> : JsonValue>;
		} else {
			return stream.pipeThrough(new TransformStream({ transform: (chunk, controller) => { controller.enqueue(chunk.value as any); } }));
		}
	});
}