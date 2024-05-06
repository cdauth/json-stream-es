import { JsonChunkType, StringRole, type JsonChunk } from "./types";
import { AbstractTransformStream } from "./utils";

export type JsonChunkWithPath = JsonChunk & {
	/**
	 * An array that describes the chain of object and array keys that the current value is located under.
	 * String values represent object keys, while numbers represent array indexes (starting at 0).
	 * The root value’s path is an empty array.
	 *
	 * For objects, any chunks between the colon and the comma (or end of object) will have the property
	 * key in the path, while other chunks (such as the object start/end and the key string start/chunk/end)
	 * will have the path of the object itself.
	 * For arrays, any chunks in between the array start and end except the comma will have the array index
	 * in the path, while other chunks (such as the array start/end and the comma) will have the path of
	 * the array itself.
	 */
	path: ReadonlyArray<string | number>;
};

/**
 * Adds a "path" property to all JsonChunks passed through it that indicates the path of object property keys
 * and array item indexes where the chunk is located.
 */
export default class PathEnricher extends AbstractTransformStream<JsonChunk, JsonChunkWithPath> {
	protected stack: Array<{
		type: "object";
		/** pending: still receiving key STRING_CHUNKs; next: next chunk will transition state to active; active: path applies to all current chunks */
		state: "pending" | "next" | "active";
		key: string;
	} | {
		type: "array";
		/** next: next chunk will transition state to active; active: path applies to current chunks */
		state: "next" | "active";
		key: number;
	}> = [];
	protected path: ReadonlyArray<string | number> = Object.freeze([]);

	protected updatePath() {
		this.path = Object.freeze(this.stack.flatMap((cur) => cur.state === "active" ? [cur.key] : []));
	}

	protected override transform(chunk: JsonChunk, controller: TransformStreamDefaultController<JsonChunkWithPath>) {
		if (this.stack[this.stack.length - 1]?.state === "next") {
			this.stack[this.stack.length - 1].state = "active";
			this.updatePath();
		}

		if (chunk.type === JsonChunkType.OBJECT_START) {
			this.stack.push({ type: "object", state: "pending", key: "" });
		} else if (chunk.type === JsonChunkType.ARRAY_START) {
			this.stack.push({ type: "array", state: "next", key: 0 });
			this.updatePath();
		} else if (chunk.type === JsonChunkType.OBJECT_END || chunk.type === JsonChunkType.ARRAY_END) {
			this.stack.pop();
			this.updatePath();
		} else {
			const current = this.stack[this.stack.length - 1];
			if (current.type === "object") {
				if (chunk.type === JsonChunkType.STRING_CHUNK && chunk.role === StringRole.KEY) {
					current.key += chunk.value;
					this.updatePath();
				} else if (chunk.type === JsonChunkType.COLON) {
					current.state = "next";
					this.updatePath();
				} else if (chunk.type === JsonChunkType.COMMA) {
					current.state = "pending";
					current.key = "";
					this.updatePath();
				}
			} else if (current.type === "array") {
				if (chunk.type === JsonChunkType.COMMA) {
					current.state = "next";
					current.key++;
					this.updatePath();
				}
			}
		}

		controller.enqueue({ ...chunk, path: this.path });
	}

	protected override flush(controller: TransformStreamDefaultController<JsonChunkWithPath>) {
		controller.terminate();
	}
}