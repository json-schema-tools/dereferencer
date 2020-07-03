# JSON Schema Dereferencer

Otherwise known as a ref parser, this tool will replace json schema using $ref with the underlying reference, returning relevant errors otherwise.

features:
- minimal dependencies
- simple & fast
- cycle detection/handling
- switchable recusive dereferencing
- handles:
  - relative pointer refs
  - http/https uris
  - local filesystem references
- complete disrespect for $id
- configurable
 - optionally de-reference internal references only, keeping it synchronous
 - ignore refs that match a set of patterns
- extensible
  - dependency injectable fetch and filesystem
  - middleware allows you to easily implement new $ref values.
  - easily add behaviors for custom reference locations

## Getting Started

`npm install @json-schema-tools/dereferencer`

```typescript
const JsonSchemaDereferencer = require("@json-schema-tools/dereferencer").default;

const mySchema = {
    type: "object",
    properties: {
      foo: { anyOf: [
        { $ref: "#/properties/bar" },
        { type: "string" }
      ]},
      bar: { $ref: "#/properties/foo" },
      baz: { $ref: "../myschemas/baz.json" },
      jsonSchemaMetaSchema: { $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/meta-schema.json" }
    },
    additionalProperties: {
        type: "array",
        items: [
            { type: "array", items: { $ref: "#" } },
            { type: "boolean" }
        ]
    }
};

const dereferencer = new JsonSchemaDereferencer(mySchema);

console.log(derefencer.resolveSync());
console.log(await derefencer.resolve());
```

### Contributing

How to contribute, build and release are outlined in [CONTRIBUTING.md](CONTRIBUTING.md), [BUILDING.md](BUILDING.md) and [RELEASING.md](RELEASING.md) respectively. Commits in this repository follow the [CONVENTIONAL_COMMITS.md](CONVENTIONAL_COMMITS.md) specification.
