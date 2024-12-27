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
        await $i("key", 1000);
        const timer = $i.inspect().cache.get("key")?.disposeTimer;

        expect(timer).not.toBe(undefined);
    });

    it("should set a default cache mode (singleton)", async () => {
        const testFor = async (defaultKey?: string) => {
            const $i = provide("i")
                .by(() => "i")
                .once(defaultKey);
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

        await $i("1");
        await $i("2");
        await $i.dispose();

        expect($i.inspect().cache.all().length).toBe(0);
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

    it("should mount and dispose existing", async () => {
        const $i = provide("i").by(() => "i");

        await $i("key");
        await $i.mount("mounted", "key");

        expect(await $i("key")).toBe("mounted");
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

        await $i("key1", 2000);
        const timer1 = $i.inspect().cache.get("key1")?.disposeTimer;
        expect(timer1).not.toBe(undefined);
        await $i("key2");
        const timer2 = $i.inspect().cache.get("key2")?.disposeTimer;
        expect(timer2).not.toBe(undefined);
    });

    it("should isolate", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .by(() => "b")
            .using($a);
        const $c = provide("c")
            .by(() => "c")
            .using($b);

        const $iso = $c.isolate();

        expect($iso).not.toBe(undefined);
        expect($iso).not.toBe($c);
        expect($iso.dependencies[0]).not.toBe($b);
        expect($iso.dependencies[0].dependencies[0]).not.toBe($a);
    });

    it("should mock", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by((d) => d.a + "b");
        const $c = provide("c")
            .using($b)
            .by((d) => d.b + "c");

        const $mocked = $c.mock(provide("a").by(() => "mockedA"));

        const result = await $mocked();

        expect(result).toBe("mockedAbc");
    });

    it("should call start hook", async () => {
        const startHook = vi.fn();
        const $i = provide("i")
            .by(() => "i")
            .onStart(startHook);

        await $i.start();

        expect(startHook).toHaveBeenCalledTimes(1);
    });

    it("should call stop hook", async () => {
        const stopHook = vi.fn();
        const $i = provide("i")
            .by(() => "i")
            .onStop(stopHook);

        await $i();
        await $i.stop();

        expect(stopHook).toHaveBeenCalledTimes(1);
    });

    it("should call stop hook with dispose", async () => {
        const stopHook = vi.fn();
        const $i = provide("i")
            .by(() => "i")
            .onStop(stopHook);

        await $i();
        await $i.stop(true);

        expect(stopHook).toHaveBeenCalledTimes(1);
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

            await group($a, $b)("key", 1000);
            const timer = $a.inspect().cache.get("key")?.disposeTimer;
            const timer2 = $b.inspect().cache.get("key")?.disposeTimer;

            expect(timer).not.toBe(undefined);
            expect(timer2).not.toBe(undefined);
        });

        it("should dispose", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");

            const $all = group($a, $b);
            await $all("key");
            await $all.dispose();

            expect($a.inspect().cache.get("key")).toBe(undefined);
            expect($b.inspect().cache.get("key")).toBe(undefined);
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

        it("should mock", async () => {
            const $a = provide("a").by(() => "a");
            const $b = provide("b").by(() => "b");
            const $c = provide("c")
                .using($a, $b)
                .by((d) => d.a + d.b);

            const $mocked = group($a, $b, $c).mock(
                provide("a").by(() => "mockedA"),
            );

            const result = await $mocked();

            expect(result).toStrictEqual({
                a: "mockedA",
                b: "b",
                c: "mockedAb",
            });
        });

        it("should call start hooks", async () => {
            const startHookA = vi.fn();
            const startHookB = vi.fn();
            const $a = provide("a")
                .by(() => "a")
                .onStart(startHookA);
            const $b = provide("b")
                .by(() => "b")
                .onStart(startHookB);

            const $all = group($a, $b);
            $all.onStart(startHookA);
            $all.onStart(startHookB);
            await $all.start();

            expect(startHookA).toHaveBeenCalledTimes(3);
            expect(startHookB).toHaveBeenCalledTimes(3);
        });

        it("should call stop hooks", async () => {
            const stopHookA = vi.fn();
            const stopHookB = vi.fn();
            const $a = provide("a")
                .by(() => "a")
                .onStop(stopHookA);
            const $b = provide("b")
                .by(() => "b")
                .onStop(stopHookB);

            const $all = group($a, $b);
            $all.onStop(stopHookA);
            $all.onStop(stopHookB);

            await $all();
            await $all.stop();

            expect(stopHookA).toHaveBeenCalledTimes(3);
            expect(stopHookB).toHaveBeenCalledTimes(3);
        });

        it("should call stop hooks with dispose", async () => {
            const stopHookA = vi.fn();
            const stopHookB = vi.fn();
            const $a = provide("a")
                .by(() => "a")
                .onStop(stopHookA);
            const $b = provide("b")
                .by(() => "b")
                .onStop(stopHookB);

            const $all = group($a, $b);
            $all.onStop(stopHookA);
            $all.onStop(stopHookB);

            await $all();
            await $all.stop(true);

            expect(stopHookA).toHaveBeenCalledTimes(3);
            expect(stopHookB).toHaveBeenCalledTimes(3);
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
