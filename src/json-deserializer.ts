import { JsonChunkType, StringRole, type JsonChunk, type JsonValue } from "./types";
import { AbstractTransformStream } from "./utils";

enum StateType {
	ROOT = "ROOT",
	OBJECT_PROPERTY = "OBJECT_PROPERTY",
	ARRAY_ITEM = "ARRAY_ITEM"
};

type AnyState = (
	{
		type: StateType.ROOT;
		value: JsonValue;
	} | {
		type: StateType.OBJECT_PROPERTY;
		object: Record<string, JsonValue>;
		key: string;
		value: JsonValue;
		parent: State;
	} | {
		type: StateType.ARRAY_ITEM;
		array: Array<JsonValue>;
		value: JsonValue;
		parent: State;
	}
);

type State<Type extends StateType = StateType> = Extract<AnyState, { type: Type }>;

/**
 * Converts a stream of JsonChunks into JsonValues. The input stream may contain multiple JSON documents on the root level, as
 * produced by PathFilter or by concatenating multiple JsonChunk streams.
 */
export class ValueAggregator extends AbstractTransformStream<JsonChunk, JsonValue> {
	protected state: State = { type: StateType.ROOT, value: undefined };

	protected handleValueEnd(controller: TransformStreamDefaultController<JsonValue>): void {
		if (this.state.type === StateType.ROOT) {
			controller.enqueue(this.state.value);
			this.state.value = undefined;
		} else if (this.state.type === StateType.OBJECT_PROPERTY) {
			this.state.object[this.state.key] = this.state.value;
			this.state.key = "";
			this.state.value = undefined;
		} else if (this.state.type === StateType.ARRAY_ITEM) {
			this.state.array.push(this.state.value);
			this.state.value = undefined;
		}
	}

	protected override transform(chunk: JsonChunk, controller: TransformStreamDefaultController<JsonValue>): void {
		if (chunk.type === JsonChunkType.NUMBER_VALUE || chunk.type === JsonChunkType.BOOLEAN_VALUE || chunk.type === JsonChunkType.NULL_VALUE) {
			this.state.value = chunk.value;
			this.handleValueEnd(controller);
		}

		else if (chunk.type === JsonChunkType.STRING_START && chunk.role === StringRole.VALUE) {
			this.state.value = "";
		}
		else if (chunk.type === JsonChunkType.STRING_CHUNK && chunk.role === StringRole.VALUE) {
			this.state.value += chunk.value;
		}
		else if (chunk.type === JsonChunkType.STRING_END && chunk.role === StringRole.VALUE) {
			this.handleValueEnd(controller);
		}

		else if (chunk.type === JsonChunkType.ARRAY_START) {
			this.state.value = [];
			this.state = {
				type: StateType.ARRAY_ITEM,
				array: this.state.value,
				value: undefined,
				parent: this.state
			};
		} else if (chunk.type === JsonChunkType.ARRAY_END && this.state.type === StateType.ARRAY_ITEM) {
			this.state = this.state.parent;
			this.handleValueEnd(controller);
		}

		else if (chunk.type === JsonChunkType.OBJECT_START) {
			this.state.value = {};
			this.state = {
				type: StateType.OBJECT_PROPERTY,
				object: this.state.value,
				key: "",
				value: undefined,
				parent: this.state
			};
		} else if (chunk.type === JsonChunkType.OBJECT_END && this.state.type === StateType.OBJECT_PROPERTY) {
			this.state = this.state.parent;
			this.handleValueEnd(controller);
		} else if (chunk.type === JsonChunkType.STRING_CHUNK && chunk.role === StringRole.KEY && this.state.type === StateType.OBJECT_PROPERTY) {
			this.state.key += chunk.value;
		}
	}
}