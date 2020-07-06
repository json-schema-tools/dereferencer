import Dereferencer from "./index";
import { Properties } from "@json-schema-tools/meta-schema";

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
    const dereffed = await dereferencer.resolve();
    const props = dereffed.properties as Properties;
    expect(props.bar).toBe(props.foo);
    expect(props.fromFile).not.toBe(props.bar);
    expect(props.fromFile).not.toBe(props.foo);
    expect(props.fromFile.type).toBe("string");
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
    const dereffed = await dereferencer.resolve();
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
    const dereffed = await dereferencer.resolve();
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
          $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/meta-schema.json",
        },
      },
    });
    const dereffed = await dereferencer.resolve();
    const props = dereffed.properties as Properties;
    expect(props.jsonSchemaMetaSchema.type).toBeDefined();
    expect(props.jsonSchemaMetaSchema.definitions.nonNegativeIntegerDefault0).toBeDefined();
    expect(props.jsonSchemaMetaSchema.definitions.nonNegativeIntegerDefault0.allOf[0].$ref).toBeUndefined();
    expect(props.jsonSchemaMetaSchema.definitions.nonNegativeIntegerDefault0.allOf[0].type).toBe("integer");
  });

  it("can deal with root refs-to-ref as url", async () => {
    expect.assertions(6);
    const dereferencer = new Dereferencer({
      $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/meta-schema.json",
    });
    const dereffed = await dereferencer.resolve();
    expect(dereffed).toBeDefined();
    expect(dereffed.type).toHaveLength(2);
    expect(dereffed.type).toHaveLength(2);
    expect(dereffed.type).toContain("object");
    expect(dereffed.type).toContain("boolean");
    expect((dereffed.properties as Properties).additionalItems).toBe(dereffed);
  });

  it("can deal with root refs-to-ref as file", async () => {
    const dereferencer = new Dereferencer({
      $ref: "./src/test-schema-1.json",
    });
    const { type } = await dereferencer.resolve();
    expect(type).toBe("string");
  });

});
