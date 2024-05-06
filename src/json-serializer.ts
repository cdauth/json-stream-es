import { StringRole, arrayEnd, arrayStart, booleanValue, colon, comma, nullValue, objectEnd, objectStart, stringChunk, stringEnd, stringStart, type JsonChunk, type JsonValue } from "./types";
import { iterableToSource, iterableToStream, streamToIterable } from "./utils";

type AnyIterable<T> = Iterable<T> | AsyncIterable<T> | ReadableStream<T>;

function normalizeStream<T, S extends symbol>(iterable: AnyIterable<T>, symbol: S): ReadableStream<T> & { [K in S]: true } {
	if (Symbol.asyncIterator in iterable || Symbol.iterator in iterable) {
		return Object.assign(iterableToStream(iterable), { [symbol]: true as const });
	} else {
		return Object.assign(Object.create(iterable), { [symbol]: true as const });
	}
}

const stringStreamSymbol = Symbol("stringStream");
export type StringStream = ReadableStream<string> & { [stringStreamSymbol]: true };
export function stringStream(stream: AnyIterable<string>): StringStream {
	return normalizeStream(stream, stringStreamSymbol);
}
export function isStringStream(value: any): value is StringStream {
	return value && typeof value === "object" && !!value[stringStreamSymbol];
}

const objectStreamSymbol = Symbol("objectStream");
export type ObjectStream<V> = ReadableStream<[key: string | StringStream, value: V]> & { [objectStreamSymbol]: true };
export function objectStream<T>(obj: AnyIterable<[key: string | StringStream, value: T]>): ObjectStream<T> {
	return normalizeStream(obj, objectStreamSymbol);
}
export function isObjectStream(value: any): value is ObjectStream<any> {
	return value && typeof value === "object" && !!value[objectStreamSymbol];
}

const arrayStreamSymbol = Symbol("arrayStream");
export type ArrayStream<V> = ReadableStream<V> & { [arrayStreamSymbol]: true };
export function arrayStream<T>(obj: AnyIterable<T>): ArrayStream<T> {
	return normalizeStream(obj, arrayStreamSymbol);
}
export function isArrayStream(value: any): value is ArrayStream<any> {
	return value && typeof value === "object" && !!value[arrayStreamSymbol];
}


type SyncOrAsync<T> = T | Promise<T> | (() => T | Promise<T>);
export type SerializableJsonValue = SyncOrAsync<
	| { [key: string]: SerializableJsonValue }
	| (ReadableStream<[key: string | StringStream, value: SerializableJsonValue]> & { [objectStreamSymbol]: true }) // Cannot use ObjectStream<StreamedJsonValue> due to circular reference
	| Array<SerializableJsonValue>
	| ReadableStream<SerializableJsonValue> & { [arrayStreamSymbol]: true } // Cannot use ArrayStream<StreamedJsonValue> due to circular reference
	| string
	| StringStream
	| number | boolean | null
	| undefined
>;

async function* serializeJson(value: SerializableJsonValue): AsyncIterable<JsonChunk> {
	const val = await (typeof value === "function" ? value() : value);

	if (val == null) {
		yield nullValue();
	} else if (typeof val === "boolean") {
		yield booleanValue(val);
	} else if (typeof val === "string" || isStringStream(val)) {
		yield stringStart();
		for await (const chunk of isStringStream(val) ? streamToIterable(val) : [val]) {
			yield stringChunk(chunk);
		}
		yield stringEnd();
	} else if (Array.isArray(val) || isArrayStream(val)) {
		yield arrayStart();

		let first = true;
		for await (const v of isArrayStream(val) ? streamToIterable(val) : val) {
			if (first) {
				first = false;
			} else {
				yield comma();
			}

			for await (const chunk of serializeJson(v)) {
				yield chunk;
			}
		}

		yield arrayEnd();
	} else {
		yield objectStart();

		let first = true;
		for await (const [k, rawV] of isObjectStream(val) ? streamToIterable(val) : Object.entries(val)) {
			const v = await (typeof rawV === "function" ? rawV() : rawV);
			if (v === undefined) {
				continue;
			}

			if (first) {
				first = false;
			} else {
				yield comma();
			}

			yield stringStart(StringRole.KEY);
			for await (const chunk of isStringStream(k) ? streamToIterable(k) : [k]) {
				yield stringChunk(chunk, StringRole.KEY);
			}
			yield stringEnd(StringRole.KEY);
			yield colon();

			for await (const chunk of serializeJson(v)) {
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
	constructor(value: SerializableJsonValue, strategy?: QueuingStrategy<JsonValue>) {
		super(iterableToSource(serializeJson(value)), strategy);
	}
}