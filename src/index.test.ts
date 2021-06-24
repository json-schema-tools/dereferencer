import Dereferencer, { NonStringRefError } from "./index";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";

describe("Dereferencer", () => {

  it("can be constructed", () => {
    const dereferencer = new Dereferencer({});
    expect(dereferencer).toBeInstanceOf(Dereferencer);
  });

  it("does nothing when there are no refs", async () => {
    const test = {
      type: "object",
      properties: {
        foo: { type: "string" }
      }
    } as JSONSchema;
    const dereferencer = new Dereferencer(test);
    const dereffed = await dereferencer.resolve();
    expect(dereffed).toBe(test);
  });

  it("simple dereffing", async () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { $ref: "#/properties/foo" },
        fromFile: { $ref: "./src/test-schema.json" },
      },
    });

    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    const props = dereffed.properties as Properties;
    expect(props.bar).toBe(props.foo);
    expect(props.fromFile).not.toBe(props.bar);
    expect(props.fromFile).not.toBe(props.foo);
    expect(props.fromFile.type).toBe("string");
  });

  it("throws when the ref is not a string", () => {
    expect.assertions(1);
    try {
      new Dereferencer({
        type: "object",
        properties: {
          bar: { $ref: 123 },
        },
      });
    } catch (e) {
      expect(e).toBeInstanceOf(NonStringRefError);
    }
  });

  it("boolean schemas, nadda prawblem", async () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        bar: { $ref: "#/definitions/leBool" },
        foo: { $ref: "#/definitions/laBool" },
      },
      definitions: {
        leBool: true,
        laBool: false
      }
    });
    expect(await dereferencer.resolve()).toEqual({
      type: "object",
      properties: {
        bar: true,
        foo: false
      },
    });
  });

  it("boolean schemas as root", async () => {
    expect.assertions(1);
    const dereferencer = new Dereferencer(true);
    expect(await dereferencer.resolve()).toEqual(true);
  });

  it("boolean schema root ref", async () => {
    expect.assertions(1);
    const dereferencer = new Dereferencer({
      $ref: "#/definitions/a",
      definitions: { a: true }
    });
    expect(await dereferencer.resolve()).toEqual(true);
  });

  it("can ref other refs", async () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { $ref: "#/properties/foo" },
        baz: { $ref: "#/properties/bar" },
      },
    });
    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    const props = dereffed.properties as Properties;
    expect(props.bar).toBe(props.foo);
    expect(props.baz).toBe(props.foo);
    expect(props.baz).toBe(props.bar);
  });

  it("order doesnt matter", async () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        bar: { $ref: "#/properties/foo" },
        foo: { $ref: "./src/test-schema.json" },
        baz: { $ref: "#/properties/bar" },
      },
    });
    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    const props = dereffed.properties as Properties;
    expect(props.bar).toBe(props.foo);
    expect(props.baz).toBe(props.foo);
    expect(props.baz).toBe(props.bar);
    expect(props.baz.type).toBe("string");
  });

  it("can handle recursively dereffing", async () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        jsonSchemaMetaSchema: {
          $ref: "https://meta.json-schema.tools",
        },
      },
    });
    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    const props = dereffed.properties as Properties;

    const oneOfs = props.jsonSchemaMetaSchema.oneOf as JSONSchemaObject[];
    expect(oneOfs).toBeInstanceOf(Array);

    const oProp = oneOfs[0].properties as Properties;
    expect(oProp.maxLength.title)
      .toBe("nonNegativeInteger");

    expect(oProp.minItems.title)
      .toBe("nonNegativeIntegerDefaultZero");

    expect(oProp.dependencies.additionalProperties.anyOf[0])
      .toBe(props.jsonSchemaMetaSchema);
  });

  it("can deal with root refs-to-ref as url", async () => {
    expect.assertions(7);
    const dereferencer = new Dereferencer({
      $ref: "https://meta.json-schema.tools",
    });
    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    expect(dereffed).toBeDefined();
    expect(dereffed.oneOf).toBeInstanceOf(Array);

    const oneOfs = dereffed.oneOf as JSONSchemaObject[];

    expect(oneOfs[0].type).toBe("object");
    expect(oneOfs[1].type).toBe("boolean");
    expect((oneOfs[0].properties as Properties).additionalItems).toBe(dereffed);
    expect(
      (oneOfs[0].properties as Properties).minProperties.title
    ).toBe("nonNegativeIntegerDefaultZero");
    expect(dereffed.definitions).toBeUndefined();
  });

  it("can deal with root refs-to-ref as file", async () => {
    const dereferencer = new Dereferencer({
      $ref: "./src/test-schema-1.json",
    });
    const { type } = await dereferencer.resolve() as JSONSchemaObject;
    expect(type).toBe("string");
  });

  it("can de-ref internal refs starting from the root", async () => {
    const schema = {
      definitions: {
        a: {
          type: "array",
          items: {
            $ref: "#/definitions/b"
          }
        },
        b: {
          title: "b",
          type: "string"
        },
      },
      $ref: "#/definitions/a",
    };
    const dereferencer = new Dereferencer(schema);
    const dereffedSchema = await dereferencer.resolve() as JSONSchemaObject;
    expect(dereffedSchema.type).toBe("array");
    expect((dereffedSchema.items as JSONSchemaObject).title).toBe("b");
  });

  it("can use refs to fields other than 'definitions'", async () => {
    const dereferencer = new Dereferencer({
      components: {
        a: {
          type: "array",
          items: {
            $ref: "#/components/b"
          }
        },
        b: {
          title: "b",
          type: "string"
        },
      },
      $ref: "#/components/a",
    });
    const s = await dereferencer.resolve() as JSONSchemaObject;
    expect(s.type).toBe("array");
    expect((s.items as JSONSchemaObject).title).toBe("b");
  });

  it("handles overriding properties found in $refs prop ordering doesnt matter", async () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        Bar: {
          title: "bar",
          $ref: "#/definitions/Bar"
        },
        Baz: {
          $ref: "#/definitions/Baz"
        }
      },
      definitions: {
        Bar: {
          title: "bar",
          $ref: "#/definitions/Baz",
        },
        Baz: {
          type: "string",
          title: "baz"
        }
      }
    });
    const r = await dereferencer.resolve() as JSONSchemaObject;
    expect((r.properties as Properties).Bar.title).toBe("bar");
  });

  it("handles overriding properties found in $refs", async () => {
    const dereferencer = new Dereferencer({
      $ref: "#/definitions/a",
      definitions: {
        a: {
          title: "bar",
          $ref: "#/definitions/b",
        },
        b: {
          title: "baz",
          description: "abc",
          type: "string"
        }
      }
    });
    const r = await dereferencer.resolve() as JSONSchemaObject;
    expect(r.description).toBe("abc");
    expect(r.title).toBe("bar");
  });
});


describe("custom protocol handling", () => {

  it("can accept protocol handler options", async () => {
    const ref = "ipfs://123456789";
    const dereferencer = new Dereferencer({ $ref: ref }, {
      protocolHandlerMap: {
        ipfs: (ref) => Promise.resolve({ type: "string", title: ref })
      }
    });
    const r = await dereferencer.resolve() as JSONSchemaObject;

    expect(r.title).toBe(ref)
  });
});
