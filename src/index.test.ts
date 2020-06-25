import Dereferencer from "./index";
import { ObjectWji6VXSR } from "@json-schema-tools/meta-schema";

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
        jsonSchemaMetaSchema: { $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/meta-schema.json" },
        fromFile: { $ref: "./src/test-schema.json" },
      },
    });
    const dereffed = await dereferencer.resolve();
    const props = dereffed.properties as ObjectWji6VXSR;
    expect(props.bar).toStrictEqual(props.foo);
    expect(props.jsonSchemaMetaSchema.type).toBeDefined();
    expect(props.fromFile.type).toBeDefined();
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
    const props = dereffed.properties as ObjectWji6VXSR;
    expect(props.bar).toStrictEqual(props.foo);
    expect(props.baz).toStrictEqual(props.foo);
    expect(props.baz).toStrictEqual(props.bar);
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
    const props = dereffed.properties as ObjectWji6VXSR;
    expect(props.bar).toStrictEqual(props.foo);
    expect(props.baz).toStrictEqual(props.foo);
    expect(props.baz).toStrictEqual(props.bar);
    expect(props.baz.type).toBe("string");
  });

});
