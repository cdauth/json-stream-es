export async function* streamToIterable<T>(stream: ReadableStream<T>): AsyncIterable<T> {
	const reader = stream.getReader();

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			return;
		} else {
			yield value;
		}
	}
}

export function iterableToSource<T>(iterable: AsyncIterable<T> | Iterable<T>): UnderlyingDefaultSource<T> {
	const iterator = Symbol.asyncIterator in iterable ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
	return {
		async pull(controller) {
			const { value, done } = await iterator.next();
			if (done) {
				controller.close();
			} else {
				controller.enqueue(value);
			}
		},
	};
}

export function iterableToStream<T>(iterable: AsyncIterable<T> | Iterable<T>, strategy?: QueuingStrategy<T>): ReadableStream<T> {
	return new ReadableStream<T>(iterableToSource(iterable), strategy);
}

export async function streamToArray<T>(stream: ReadableStream<T>): Promise<T[]> {
	const reader = stream.getReader();
	const result: T[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			return result;
		} else {
			result.push(value);
		}
	}
}

export async function streamToString(stream: ReadableStream<string>): Promise<string> {
	return (await streamToArray(stream)).join("");
}

export function stringToStream(string: string): ReadableStream<string> {
	return iterableToStream([string]);
}

export function concatStreams<T>(...streams: Array<ReadableStream<T> | (() => ReadableStream<T>)>): ReadableStream<T> {
	const transform = new TransformStream();
	(async () => {
		for (const stream of streams) {
			await (typeof stream === "function" ? stream() : stream).pipeTo(transform.writable, { preventClose: true });
		}
		transform.writable.close();
	})().catch((err) => {
		transform.writable.abort(err);
	});
	return transform.readable;
}

export abstract class AbstractTransformStream<I, O> extends TransformStream<I, O> {
	constructor(writableStrategy?: QueuingStrategy<I>, readableStrategy?: QueuingStrategy<O>) {
		super({
			transform: (chunk, controller) => {
				return this.transform(chunk, controller);
			},
			flush: (controller) => {
				return this.flush(controller);
			}
		}, writableStrategy, readableStrategy);
	}

	protected abstract transform(chunk: I, controller: TransformStreamDefaultController<O>): void | Promise<void>;

	protected flush(controller: TransformStreamDefaultController<O>): void | Promise<void> {
		controller.terminate();
	}
}