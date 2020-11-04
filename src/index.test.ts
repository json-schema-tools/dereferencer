import Dereferencer, { NonStringRefError } from "./index";
import { Properties, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe("Dereferencer", () => {

  it("can be constructed", () => {
    const dereferencer = new Dereferencer({});
    expect(dereferencer).toBeInstanceOf(Dereferencer);
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
      const dereferencer = new Dereferencer({
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
    expect.assertions(1);
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
    expect.assertions(4);
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        jsonSchemaMetaSchema: {
          $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/src/schema.json",
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
      $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/src/schema.json",
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

  it("can de-ref internal refs starting from the root and using keys other than defintions", async () => {
    const dereferencer = new Dereferencer({
      components: {
        ProofNodes: {
          type: "array",
          items: {
            $ref: "#/components/ProofNode"
          }
        },
        ProofNode: {
          type: "string"
        },
      },
      $ref: "#/components/ProofNodes",
    });
    const { type } = await dereferencer.resolve() as JSONSchemaObject;
    expect(type).toBe("array");
  });

  it("can handle oneof refs with types on it", async () => {
    const dereferencer = new Dereferencer({
      $ref: "#/components/BlockNumberOrTag",
      components: {
        BlockNumberOrTag: {
          oneOf: [
            {
              $ref: "#/components/BlockNumber"
            },
            {
              $ref: "#/components/BlockNumberTag"
            }
          ]
        },
        BlockNumber: {
          $ref: "#/components/Integer",
          description: "the hex represetnation of a blocks height",
          title: "blockNumber",
          type: "string",
        },
        Integer: {
          type: "string",
          pattern: "0x[a-fA-F0-9]$",
          description: "integer hex",
        },
        BlockNumberTag: {
          title: "blockNumberTag",
          type: "string",
          description: "the optional block height description",
          enum: ["earliest", "latest", "pending"],
        },
        StorageProofKey: {
          $ref: "#/components/Integer",
          description: "The key used to get the storage slot in its account tree.",
          title: "storageProofKey"
        },
      },
    });
    const r = await dereferencer.resolve() as JSONSchemaObject;
    console.log("r=", r);
    expect((r as any).oneOf[0].title).toBe("blockNumber");
  });
});
