import { StringRole, arrayEnd, arrayStart, booleanValue, colon, comma, nullValue, objectEnd, objectStart, stringChunk, stringEnd, stringStart, type JsonChunk, type JsonValue } from "./types";
import { iteratorToSource } from "./utils";

function* serializeJson(value: JsonValue): Iterable<JsonChunk> {
	if (value === null) {
		yield nullValue();
	} else if (typeof value === "boolean") {
		yield booleanValue(value);
	} else if (typeof value === "string") {
		yield stringStart();
		yield stringChunk(value);
		yield stringEnd();
	} else if (Array.isArray(value)) {
		yield arrayStart();

		let first = true;
		for (const v of value) {
			if (first) {
				first = false;
			} else {
				yield comma();
			}

			for (const chunk of serializeJson(v)) {
				yield chunk;
			}

		}

		yield arrayEnd();
	} else if (value !== undefined) {
		yield objectStart();

		let first = true;
		for (const [k, v] of Object.entries(value)) {
			if (first) {
				first = false;
			} else {
				yield comma();
			}

			yield stringStart(StringRole.KEY);
			yield stringChunk(k, StringRole.KEY);
			yield stringEnd(StringRole.KEY);
			yield colon();

			for (const chunk of serializeJson(v)) {
				yield chunk;
			}
		}

		yield objectEnd();
	}
}

/**
 * Converts any JSON-stringifiable JavaScript value into a stream of JsonChunks.
 */
export class JsonSerializer extends ReadableStream<JsonValue> {
	constructor(value: JsonValue, strategy?: QueuingStrategy<JsonValue>) {
		super(iteratorToSource(serializeJson(value)), strategy);
	}
}