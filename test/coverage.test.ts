import { group, provide } from "../src";
import { describe, expect, it, vi } from "vitest";

describe("single provider", () => {
    it("should create", async () => {
        const $i = provide("p");
        const o = await $i();

        expect(o).toStrictEqual({});
    });

    it("should rename", async () => {
        const $a = provide("a");
        const $b = $a.as("b");

        expect($b.id).toBe("b");
    });

    it("should resolve", async () => {
        const $i = provide("i").by(() => "i");
        const i = await $i();

        expect(i).toBe("i");
    });

    it("should cache", async () => {
        const $i = provide("i").by(() => "i");
        const i = await $i("key");

        expect(i).not.toBe(undefined);
        expect(await $i("key")).toBe(i);
    });

    it("should cache for a time", async () => {
        const $i = provide("i").by(() => "i");
        await $i("key", { ttl: 1000 });
        const timer = $i.inspect().cache.get("key")?.disposeTimer;

        expect(timer).not.toBe(undefined);
    });

    it("should set a default cache mode (singleton)", async () => {
        const testFor = async (defaultKey?: string) => {
            const $i = provide("i")
                .by(() => "i")
                .persisted(defaultKey);
            await $i();
            const cache = $i.inspect().cache;
            const entry = cache.get(defaultKey || "singleton");

            expect(entry).not.toBe(undefined);
        };

        testFor();
        testFor("custom");
    });

    it("should dispose", async () => {
        const $i = provide("i").by(() => "i");

        let dispositionCount = 0;
        await $i("1", { disposer: () => dispositionCount++ });
        await $i("2", { disposer: () => dispositionCount++ });
        await $i.dispose();

        expect(dispositionCount).toBe(2);
    });

    it("should dispose by a cache key", async () => {
        const $i = provide("i").by(() => "i");

        let dispositionKey: string | undefined;
        await $i("1", { disposer: () => (dispositionKey = "1") });
        await $i("2", { disposer: () => (dispositionKey = "2") });
        await $i.dispose("2");

        expect(dispositionKey).toBe("2");
    });

    it("should set a default disposer", async () => {
        let isDisposed = false;
        const $i = provide("i")
            .by(() => "i")
            .withDisposer(() => (isDisposed = true));

        await $i("key");
        await $i.dispose();

        expect(isDisposed).toBe(true);
    });

    it("should clone", async () => {
        const $a = provide("a").by(() => "a");
        const $b = $a.clone();

        expect($b).not.toBe(undefined);
        expect($b).not.toBe($a);
    });

    it("should mount", async () => {
        const $i = provide("i").by(() => "i");
        const instance = "mounted";
        await $i.mount(instance, "key");

        expect(await $i("key")).toBe(instance);
    });

    it("should dispose previously mounted value", async () => {
        const disposer = vi.fn();
        const $i = provide("i").by(() => "i");
        const instance = "mounted";

        await $i.mount("first", "key", { disposer });
        await $i.mount(instance, "key");

        expect(disposer).toHaveBeenCalledTimes(1);
        expect(await $i("key")).toBe(instance);
    });

    it("should complete the dependencies", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by((d) => d.a + "b");

        const instance = await $b.complete({ a: "test" });

        expect(instance).toBe("testb");
    });

    it("should complete and cache", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by((d) => d.a + "b");

        const instance = await $b.complete({ a: "test" }, "key");

        expect(instance).toBe("testb");
        expect(await $b("key")).toBe(instance);
    });

    it("should complete, cache and dispose previously cached instance", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by((d) => d.a + "b");

        await $b("key");
        const instance = await $b.complete({ a: "test" }, "key");

        expect(instance).toBe("testb");
        expect(await $b("key")).toBe(instance);
    });

    it("should set default ttl", async () => {
        const $i = provide("i")
            .by(() => "i")
            .temporary(1000);

        await $i("key");

        const timer = $i.inspect().cache.get("key")?.disposeTimer;
        expect(timer).not.toBe(undefined);
    });

    it("should set default ttl with cache key", async () => {
        const $i = provide("i")
            .by(() => "i")
            .temporary(1000);

        await $i("key1", { ttl: 2000 });
        const timer1 = $i.inspect().cache.get("key1")?.disposeTimer;
        expect(timer1).not.toBe(undefined);
        await $i("key2");
        const timer2 = $i.inspect().cache.get("key2")?.disposeTimer;
        expect(timer2).not.toBe(undefined);
    });
});

describe("many providers", () => {
    describe("groups", () => {
        it("should create", () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");
            const $all = group($a, $b);

            expect($all).not.toBe(undefined);
            expect($all.list).toStrictEqual([$a, $b]);
            expect($all.map).toStrictEqual({
                a: $a,
                b: $b,
            });
        });

        it("should add a provider", () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");
            const $c = provide("c").by(() => "c");
            const $all = group($a, $b).add($c);

            expect($all.list).toStrictEqual([$a, $b, $c]);
            expect($all.map).toStrictEqual({
                a: $a,
                b: $b,
                c: $c,
            });
        });

        it("should concat", () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");
            const $c = provide("c").by(() => "c");
            const $d = provide("d").by(() => "d");
            const $ab = group($a, $b);
            const $cd = group($c, $d);
            const $all = $ab.concat($cd);

            expect($all.list).toStrictEqual([$a, $b, $c, $d]);
            expect($all.map).toStrictEqual({
                a: $a,
                b: $b,
                c: $c,
                d: $d,
            });
        });

        it("should ignore recurring providers on add/concat", () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");
            const $all = group($a, $b).add($b).concat(group($b));

            expect($all.list).toStrictEqual([$a, $b]);
        });

        it("should build", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");

            const all = await group($a, $b)();

            expect(all).toStrictEqual({
                a: "a",
                b: "b",
            });
        });

        it("should build and cache for a group", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");

            const all = await group($a, $b)("key");
            const all2 = await group($a, $b)("key");

            expect(all).toStrictEqual(all2);
            expect(all).toStrictEqual({
                a: "a",
                b: "b",
            });
        });

        it("should build and cache for a group with ttl", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");

            await group($a, $b)("key", { ttl: 1000 });
            const timer = $a.inspect().cache.get("key")?.disposeTimer;
            const timer2 = $b.inspect().cache.get("key")?.disposeTimer;

            expect(timer).not.toBe(undefined);
            expect(timer2).not.toBe(undefined);
        });

        it("should dispose", async () => {
            let dispositionCount = 0;

            const $a = provide("a")
                .by(() => "a")
                .withDisposer(() => dispositionCount++);
            const $b = provide("b")
                .by(() => "b")
                .withDisposer(() => dispositionCount++);

            const $all = group($a, $b);
            await $all("key");
            await $all.dispose();

            expect(dispositionCount).toBe(2);
        });

        it("should isolate", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b")
                .using($a)
                .by(() => "b");
            const $c = provide("c")
                .using($a)
                .by(() => "c");

            const $iso = group($a, $b, $c).isolate();

            expect($iso.map.a).not.toBe($a);
            expect($iso.map.b).not.toBe($b);
            expect($iso.map.c).not.toBe($c);
            expect($iso.map.b.dependencies[0]).toBe($iso.map.a);
            expect($iso.map.c.dependencies[0]).toBe($iso.map.a);
        });

        it("should isolate one", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b")
                .using($a)
                .by(() => "b");
            const $c = provide("c")
                .using($a)
                .by(() => "c");

            const $c2 = group($a, $b, $c).isolateOne((g) => g.c);

            expect($c2).not.toBe($c);
            expect($c2.dependencies[0]).not.toBe($a);
        });

        it("should isolate some", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b")
                .using($a)
                .by(() => "b");
            const $c = provide("c")
                .using($a)
                .by(() => "c");

            const $iso = group($a, $b, $c).isolateSome((g) => [g.a, g.c]);

            expect($iso.map.a).not.toBe($a);
            expect($iso.map.c).not.toBe($c);
            expect($iso.map.c.dependencies[0]).toBe($iso.map.a);
        });
    });

    describe("dependency graph", () => {
        it("should construct and build a basic dependency graph", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b")
                .using($a)
                .by((d) => d.a + "b");
            const $c = provide("c")
                .using($b)
                .by((d) => d.b + "c");
            const $d = provide("d")
                .using($b)
                .by((d) => d.b + "d");

            const all = await group($a, $b, $c, $d)();

            expect(all).toStrictEqual({
                a: "a",
                b: "ab",
                c: "abc",
                d: "abd",
            });
        });
    });
});
