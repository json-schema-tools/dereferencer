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
    expect(dereffed).toStrictEqual(test);
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
    expect.assertions(8);
    const dereferencer = new Dereferencer({
      $ref: "https://meta.json-schema.tools",
    });
    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    expect(dereffed).toBeDefined();
    expect(dereffed.oneOf).toBeInstanceOf(Array);

    const oneOfs = dereffed.oneOf as any;

    expect(oneOfs[0].type).toBe("object");
    expect(oneOfs[1].type).toBe("boolean");
    expect((oneOfs[0].properties as Properties).additionalItems).toBe(dereffed);
    expect(
      (oneOfs[0].properties as Properties).minProperties.title
    ).toBe("nonNegativeIntegerDefaultZero");
    expect(dereffed.definitions).toBeUndefined();
    expect(oneOfs[0].properties.contains).toBe(dereffed);
  });

  it("does not get stuck on a recursive ", async () => {
    expect.assertions(1);
    const dereferencer = new Dereferencer({
      definitions: {
        node: {
          type: "object",
          properties: {
            name: {
              type: "string"
            },
            children: {
              type: "array",
              items: {
                $ref: "#/definitions/node"
              }
            }
          }
        }
      },
      type: "object",
      properties: {
        tree: {
          title: "Recursive references",
          $ref: "#/definitions/node"
        }
      }
    });

    const dereffed = await dereferencer.resolve();


    // The cycle closes on the resolved node itself: items.properties is the
    // same object as tree.properties. (Before #753 this wove through the
    // caller's live objects, producing a distinct properties object here.)
    const treeProperties: { name: object, children: object } = {
      name: {
        type: 'string'
      },
      children: {},
    };
    const recursiveChildren = {
      type: 'array',
      items: {
        type: 'object',
        properties: treeProperties,
      },
    };
    treeProperties.children = recursiveChildren;

    const expected = {
      type: "object",
      properties: {
        tree: {
          title: "Recursive references",
          type: "object",
          properties: treeProperties,
        },
      }
    }

    expect(dereffed).toStrictEqual(expected);
  });

  it("circular refs do not write the cycle into the input schema (#753)", async () => {
    const input = {
      title: "node",
      type: "object",
      properties: { child: { $ref: "#/definitions/node" } },
      definitions: {
        node: {
          title: "node",
          type: "object",
          properties: { next: { $ref: "#/definitions/node" } },
        },
      },
    };
    const snapshot = JSON.parse(JSON.stringify(input));

    const dereffed = await new Dereferencer(input as JSONSchema).resolve() as any;

    // the caller's object is untouched: $refs intact, no cycle introduced
    expect(input).toStrictEqual(snapshot);
    expect(() => JSON.stringify(input)).not.toThrow();

    // ...but the returned schema carries the cycle, detached from the input
    expect(dereffed.properties.child.properties.next).toBe(dereffed.properties.child);
    expect(dereffed.properties.child).not.toBe((input as any).definitions.node);
  });

  it("preserves shared subschema objects without mutating the input (#753)", async () => {
    const shared = { type: "string" };
    const input = {
      type: "object",
      properties: { a: shared, b: shared },
    } as any;

    const dereffed = await new Dereferencer(input).resolve() as any;

    expect(dereffed.properties.a).toBe(dereffed.properties.b);
    expect(input.properties.a).toBe(shared);
    expect(input.properties.b).toBe(shared);
  });

  it("copies input schemas that already contain object cycles (#753)", async () => {
    const input: any = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    input.properties.self = input;

    const dereffed = await new Dereferencer(input).resolve() as any;

    expect(dereffed.properties.self).toBe(dereffed);
    expect(input.properties.self).toBe(input);
    expect(input.properties.name).toStrictEqual({ type: "string" });
  });

  it("does not mutate a caller-provided rootSchema (#753)", async () => {
    const rootSchema = {
      definitions: { s: { type: "string" } },
    } as any;
    const snapshot = JSON.parse(JSON.stringify(rootSchema));

    const dereffed = await new Dereferencer(
      { $ref: "#/definitions/s" } as JSONSchema,
      { rootSchema },
    ).resolve();

    expect(rootSchema).toStrictEqual(snapshot);
    expect(dereffed).toStrictEqual({ type: "string" });
  });

  it("passes non-plain objects through the copy by reference (#753)", async () => {
    class Custom { }
    const custom = new Custom();
    const input = { type: "object", "x-custom": custom } as any;

    const dereffed = await new Dereferencer(input).resolve() as any;

    expect(dereffed["x-custom"]).toBe(custom);
  });

  it("preserves identity shared between schema and an explicit rootSchema (#753)", async () => {
    const shared = { type: "string", title: "shared" };
    const rootSchema = { definitions: { s: shared } } as any;
    const schema = {
      properties: { p: { $ref: "#/definitions/s" }, q: shared },
    } as any;

    const dereffed = await new Dereferencer(schema, { rootSchema }).resolve() as any;

    expect(dereffed.properties.p).toBe(dereffed.properties.q);
    expect(rootSchema).toStrictEqual({ definitions: { s: { type: "string", title: "shared" } } });
  });

  it("preserves own __proto__ properties when copying (#753)", async () => {
    const input = JSON.parse('{"type": "object", "__proto__": {"type": "string"}}');
    expect(Object.prototype.hasOwnProperty.call(input, "__proto__")).toBe(true);

    const dereffed = await new Dereferencer(input as JSONSchema).resolve() as any;

    expect(Object.getPrototypeOf(dereffed)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(dereffed, "__proto__")).toBe(true);
    expect(dereffed["__proto__"]).toStrictEqual({ type: "string" });
  });

  it("resolves a deeply frozen input without attempting writes (#753)", async () => {
    const input: any = {
      title: "node",
      type: "object",
      properties: { child: { $ref: "#/definitions/node" } },
      definitions: {
        node: {
          title: "node",
          type: "object",
          properties: { next: { $ref: "#/definitions/node" } },
        },
      },
    };
    const seen = new Set();
    const deepFreeze = (o: any): void => {
      if (o !== null && typeof o === "object" && !seen.has(o)) {
        seen.add(o);
        for (const k of Object.keys(o)) {
          deepFreeze(o[k]);
        }
        Object.freeze(o);
      }
    };
    deepFreeze(input);

    const dereffed = await new Dereferencer(input).resolve() as any;

    expect(dereffed.properties.child.properties.next).toBe(dereffed.properties.child);
  });

  it("never writes into objects returned by protocol handlers (#753)", async () => {
    const sharedItem = { title: "shared", type: "string" };
    const documents: any = {
      "ex://a": { $ref: "ex://b", title: "a-title" },
      "ex://b": { type: "string" },
      "ex://shared": sharedItem,
      "ex://user": { properties: { s: { $ref: "ex://shared" } } },
    };
    const snapshot = JSON.parse(JSON.stringify(documents));

    const dereffed = await new Dereferencer(
      { properties: { a: { $ref: "ex://a" }, u: { $ref: "ex://user" } } } as JSONSchema,
      { protocolHandlerMap: { ex: (ref: string) => Promise.resolve(documents[ref]) } },
    ).resolve() as any;

    expect(documents).toStrictEqual(snapshot);
    expect(documents["ex://shared"]).toBe(sharedItem);
    expect(dereffed.properties.a).toStrictEqual({ type: "string", title: "a-title" });
    expect(dereffed.properties.u.properties.s).toStrictEqual({ title: "shared", type: "string" });
    expect(dereffed.properties.u.properties.s).not.toBe(sharedItem);
  });

  it("can deal with root refs-to-ref as url, metaschema on master", async () => {
    expect.assertions(8);
    const dereferencer = new Dereferencer({
      $ref: "https://raw.githubusercontent.com/json-schema-tools/meta-schema/master/schema.json",
    });
    const dereffed = await dereferencer.resolve() as JSONSchemaObject;
    expect(dereffed).toBeDefined();
    expect(dereffed.oneOf).toBeInstanceOf(Array);

    const oneOfs = dereffed.oneOf as any;

    expect(oneOfs[0].type).toBe("object");
    expect(oneOfs[1].type).toBe("boolean");
    expect((oneOfs[0].properties as Properties).additionalItems).toBe(dereffed);
    expect(
      (oneOfs[0].properties as Properties).minProperties.title
    ).toBe("nonNegativeIntegerDefaultZero");
    expect(dereffed.definitions).toBeUndefined();
    expect(oneOfs[0].properties.contains).toBe(dereffed);
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

  it("handles definitions that are cyclical", async () => {
    const dereferencer = new Dereferencer({
      title: "rewt",
      oneOf: [
        { $ref: "#/definitions/a" },
      ],
      definitions: {
        a: { $ref: "#/definitions/rewt" },
        rewt: { $ref: "#" }
      }
    });
    const r = await dereferencer.resolve() as any;
    expect(r.title).toBe("rewt");
    expect(r.oneOf[0].title).toBe("rewt");
  });

  it("handles definitions that are deeply cyclical", async () => {
    const dereferencer = new Dereferencer({
      title: "rewt",
      oneOf: [
        { $ref: "#/definitions/rewt" },
        { $ref: "#/definitions/a" },
      ],
      definitions: {
        a: {
          title: "foo",
          type: "object",
          properties: {
            b: { $ref: "#/definitions/rewt" }
          }
        },
        rewt: { $ref: "#" }
      }
    });
    const r = await dereferencer.resolve() as any;
    expect(r.title).toBe("rewt");
    expect(r.oneOf[0].title).toBe("rewt");
    expect(r.oneOf[1].title).toBe("foo");
    expect(r.oneOf[1].properties.b.title).toBe("rewt");
  });

  it("reversing order inside oneOf makes no difference", async () => {
    const dereferencer = new Dereferencer({
      title: "rewt",
      oneOf: [
        { $ref: "#/definitions/a" },
        { $ref: "#/definitions/rewt" },
      ],
      definitions: {
        a: {
          title: "foo",
          type: "object",
          properties: {
            b: { $ref: "#/definitions/rewt" }
          }
        },
        rewt: { $ref: "#" }
      }
    });
    const r = await dereferencer.resolve() as any;
    expect(r.title).toBe("rewt");
    expect(r.oneOf[0].title).toBe("foo");
    expect(r.oneOf[0].properties.b.title).toBe("rewt");
  });

  it("dereferences refs alongside allOf at the same level (#736)", async () => {
    const dereferencer = new Dereferencer({
      type: ["object", "null"],
      properties: {
        termDetails: { $ref: "#/definitions/def2" },
      },
      allOf: [{ $ref: "#/definitions/def2" }],
      title: "def1",
      definitions: {
        def2: { type: "string" },
      },
    });
    const r = await dereferencer.resolve() as any;
    expect(r.properties.termDetails).toEqual({ type: "string" });
    expect(r.allOf).toEqual([{ type: "string" }]);
  });
});


describe("mutate", () => {
  it("default does not mutate the original schema", async () => {
    const s: JSONSchema = Object.freeze({
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { $ref: "#/properties/foo" },
        baz: { $ref: "#/properties/bar" },
      },
    });
    const dereferencer = new Dereferencer(s);

    expect(await dereferencer.resolve()).toStrictEqual({
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { type: "string" },
        baz: { type: "string" },
      },
    });
  });

  it("mutate option causes original schema to be modified", async () => {
    const s: JSONSchema = {
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { $ref: "#/properties/foo" },
        baz: { $ref: "#/properties/bar" },
      },
    };
    const dereferencer = new Dereferencer(s, { mutate: true });

    expect(await dereferencer.resolve()).toBe(s);
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


describe("openrpc metaschema", () => {

  it("can deref it", async () => {
    const ref = "https://meta.open-rpc.org/";
    const dereferencer = new Dereferencer({ $ref: ref });
    const r = await dereferencer.resolve() as JSONSchemaObject;

    expect(r.title).toBe('openrpcDocument');
  });
});


describe("resolveSync", () => {

  it("resolves internal refs synchronously", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { $ref: "#/properties/foo" },
      },
    } as JSONSchema);

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    const props = dereffed.properties as Properties;
    expect(props.bar).toBe(props.foo);
  });

  it("does nothing when there are no refs", () => {
    const test = {
      type: "object",
      properties: {
        foo: { type: "string" }
      }
    } as JSONSchema;
    const dereferencer = new Dereferencer(test);
    expect(dereferencer.resolveSync()).toStrictEqual(test);
  });

  it("resolves refs into definitions and drops them", () => {
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
    } as JSONSchema);
    expect(dereferencer.resolveSync()).toEqual({
      type: "object",
      properties: {
        bar: true,
        foo: false
      },
    });
  });

  it("recursively dereferences chained internal refs", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        a: { $ref: "#/definitions/b" },
      },
      definitions: {
        b: { $ref: "#/definitions/c" },
        c: { type: "string" },
      }
    } as JSONSchema);

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    expect((dereffed.properties as Properties).a).toEqual({ type: "string" });
  });

  it("keeps sibling keys alongside $ref", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        foo: { type: "string", title: "foo" },
        bar: { $ref: "#/properties/foo", description: "a copy with extras" },
      },
    } as JSONSchema);

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    const props = dereffed.properties as Properties;
    expect(props.bar).toEqual({ type: "string", title: "foo", description: "a copy with extras" });
    expect(props.bar).not.toBe(props.foo);
  });

  it("resolves the root schema ref (#)", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        foo: { type: "string" },
      },
      additionalProperties: { $ref: "#" },
    } as JSONSchema);

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    // { $ref: "#" } resolves to the root schema itself (same as await resolve())
    expect(dereffed.additionalProperties).toBe(dereffed);
    expect(dereffed.properties).toEqual({ foo: { type: "string" } });
  });

  it("terminates on cyclic internal refs", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        foo: { anyOf: [{ $ref: "#/properties/bar" }, { type: "string" }] },
        bar: { $ref: "#/properties/foo" },
      },
    } as JSONSchema);

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    const props = dereffed.properties as Properties;
    expect((props.foo as JSONSchemaObject).anyOf).toBeDefined();
  });

  it("boolean schemas as root", () => {
    const dereferencer = new Dereferencer(true);
    expect(dereferencer.resolveSync()).toEqual(true);
  });

  it("honors a preseeded refCache", () => {
    const dereferencer = new Dereferencer(
      {
        type: "object",
        properties: {
          bar: { $ref: "#/definitions/foo" },
        },
      } as JSONSchema,
      { refCache: { "#/definitions/foo": { type: "string", title: "cached" } } }
    );

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    expect((dereffed.properties as Properties).bar).toEqual({ type: "string", title: "cached" });
  });

  it("throws a clear error for remote refs", () => {
    const dereferencer = new Dereferencer({ $ref: "https://example.com/schema.json" } as JSONSchema);
    expect(() => dereferencer.resolveSync()).toThrow(
      'resolveSync() cannot resolve $ref "https://example.com/schema.json"'
    );
  });

  it("throws a clear error for file refs", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        fromFile: { $ref: "./src/test-schema.json" },
      },
    } as JSONSchema);
    expect(() => dereferencer.resolveSync()).toThrow(
      'resolveSync() cannot resolve $ref "./src/test-schema.json"'
    );
  });
});

describe("resolveSync options", () => {

  it("does not recurse into fetched refs when recursive is false", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        a: { $ref: "#/definitions/b" },
      },
      definitions: {
        b: { $ref: "#/definitions/c" },
        c: { type: "string" },
      }
    } as JSONSchema, { recursive: false });

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    expect((dereffed.properties as Properties).a).toEqual({ $ref: "#/definitions/c" });
  });

  it("resolves a root-level $ref", () => {
    const dereferencer = new Dereferencer({
      $ref: "#/definitions/a",
      definitions: { a: { type: "string" } },
    } as JSONSchema);

    expect(dereferencer.resolveSync()).toEqual({ type: "string" });
  });

  it("handles boolean subschemas", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        b: true,
        c: { $ref: "#/properties/b" },
      },
    } as JSONSchema);

    expect(dereferencer.resolveSync()).toEqual({
      type: "object",
      properties: { b: true, c: true },
    });
  });

  it("keeps sibling keys when the resolved ref is boolean", () => {
    const dereferencer = new Dereferencer({
      type: "object",
      properties: {
        bar: { $ref: "#/definitions/leBool", description: "still just true" },
      },
      definitions: { leBool: true },
    } as JSONSchema);

    const dereffed = dereferencer.resolveSync() as JSONSchemaObject;
    expect((dereffed.properties as Properties).bar).toBe(true);
  });

  it("throws when rootSchema is missing for a '#' ref", () => {
    const dereferencer = new Dereferencer({ $ref: "#" } as JSONSchema);
    (dereferencer as any).options.rootSchema = undefined;
    expect(() => dereferencer.resolveSync()).toThrow(
      "options.rootSchema was not provided"
    );
  });

  it("closes cycles without mutating the input (#753)", () => {
    const input = {
      title: "node",
      type: "object",
      properties: { child: { $ref: "#/definitions/node" } },
      definitions: {
        node: {
          title: "node",
          type: "object",
          properties: { next: { $ref: "#/definitions/node" } },
        },
      },
    } as any;
    const snapshot = JSON.parse(JSON.stringify(input));

    const dereffed = new Dereferencer(input as JSONSchema).resolveSync() as any;

    expect(input).toStrictEqual(snapshot);
    expect(() => JSON.stringify(input)).not.toThrow();
    expect(dereffed.properties.child.properties.next).toBe(dereffed.properties.child);
    expect(dereffed.properties.child).not.toBe(input.definitions.node);
  });

  it("preserves shared identity for repeated refs (#753)", () => {
    const dereffed = new Dereferencer({
      type: "object",
      properties: {
        a: { $ref: "#/definitions/s" },
        b: { $ref: "#/definitions/s" },
      },
      definitions: { s: { type: "string" } },
    } as JSONSchema).resolveSync() as any;

    expect(dereffed.properties.a).toBe(dereffed.properties.b);
    expect(dereffed.properties.a).toStrictEqual({ type: "string" });
  });

  it("does not mutate the input when inlining refs (#753)", () => {
    const input = {
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { $ref: "#/properties/foo" },
      },
    } as any;
    const snapshot = JSON.parse(JSON.stringify(input));

    new Dereferencer(input as JSONSchema).resolveSync();

    expect(input).toStrictEqual(snapshot);
  });
});
