export class JsonChunk<Type extends string = string> {
    constructor(
        /** The raw JSON code for this chunk. The concatenated rawValues of all chunks form a valid JSON value. */
        public readonly rawValue: string,
        public readonly type: Type
    ) {}

    toString() {
        return this.rawValue;
    }
}

/** A whitespace that appears between JSON tokens and has no semantic meaning. */
export class Whitespace extends JsonChunk<"Whitespace"> {
    constructor(rawValue: string) {
        super(rawValue, "Whitespace");
    }
}

/** A comma that separates two array/object items. */
export class Comma extends JsonChunk<"Comma"> {
    constructor(rawValue = ",") {
        super(rawValue, "Comma");
    }
}

/** A colon that separates an object key from its value. */
export class Colon extends JsonChunk<"Colon"> {
    constructor(rawValue = ":") {
        super(rawValue, "Colon");
    }
}

/**
 * The start of an object, represented by a curly open bracket. Will be followed by zero or more properties, each one represented
 * by a string (one StringStart, zero or more StringChunks, one StringEnd) for the key, a
 * Colon, a series of chunks for the value and a Comma (except for the last property); and finally an ObjectEnd.
 */
export class ObjectStart extends JsonChunk<"ObjectStart"> {
    constructor(rawValue = "{") {
        super(rawValue, "ObjectStart");
    }
}

/** The end of an object, represented by a curly close bracket. */
export class ObjectEnd extends JsonChunk<"ObjectEnd"> {
    constructor(rawValue = "}") {
        super(rawValue, "ObjectEnd");
    }
}

/**
 * The start of an array, represented by a square open bracket. Will be followed by zero or more chunks representing the values,
 * each followed by a Comma (except the last one); and finally an ArrayEnd.
 */
export class ArrayStart extends JsonChunk<"ArrayStart"> {
    constructor(rawValue = "[") {
        super(rawValue, "ArrayStart");
    }
}

/** The end of an array, represented by a square close bracket. */
export class ArrayEnd extends JsonChunk<"ArrayEnd"> {
    constructor(rawValue = "]") {
        super(rawValue, "ArrayEnd");
    }
}

/**
 * The start of a string, represented by a double quote. Will be followed by zero or more StringChunks and finally
 * a StringEnd.
 */
export class StringStart extends JsonChunk<"StringStart"> {
    constructor(rawValue = "\"") {
        super(rawValue, "StringStart");
    }
}

/**
 * A section of a string. Unicode characters are always fully included, so an escape value like \uffff will never span across multiple chunks.
 */
export class StringChunk extends JsonChunk<"StringChunk"> {
    constructor(
        /** The string value of the string, without quotes and with backslash escapes resolved. */
        public readonly value: string,
        rawValue?: string
    ) {
        super(rawValue ?? JSON.stringify(value).slice(1, -1), "StringChunk");
    }
}

/** The end of a string, represented by a double quote. */
export class StringEnd extends JsonChunk<"StringEnd"> {
    constructor(rawValue = "\"") {
        super(rawValue, "StringEnd");
    }
}

/** A number. May be positive/negative and an integer/float, and the raw value can have an exponent. */
export class NumberValue extends JsonChunk<"NumberValue"> {
    constructor(
        public readonly value: number,
        rawValue?: string
    ) {
        super(rawValue ?? JSON.stringify(value), "NumberValue");
    }
}

/** A boolean, either true or false. */
export class BooleanValue extends JsonChunk<"BooleanValue"> {
    constructor(
        public readonly value: boolean,
        rawValue?: string
    ) {
        super(rawValue ?? JSON.stringify(value), "BooleanValue");
    }
}

/** A null value. */
export class NullValue extends JsonChunk<"NullValue"> {
    constructor(rawValue = "null") {
        super(rawValue, "NullValue");
    }
}
