import { group, provide } from "../src";
import { describe, it } from "vitest";
import pMap from "p-map";

const ITERATIONS = 1_000_000;

describe("benchmarks", () => {
    it("resolve a singleton provider", async () => {
        const $i = provide("i").by(() => "i");

        for (let i = 0; i < ITERATIONS; i++) {
            await $i();
        }
    });

    it("resolve a cached singleton provider", async () => {
        const $i = provide("i")
            .by(() => "i")
            .persisted();

        for (let i = 0; i < ITERATIONS; i++) {
            await $i();
        }
    });

    it("resolve a provider with dependencies", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by(() => "b");

        for (let i = 0; i < ITERATIONS; i++) {
            await $b();
        }
    });

    it("resolve a provider with deep dependencies", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by(() => "b");
        const $c = provide("c")
            .using($b)
            .by(() => "c");
        const $d = provide("d")
            .using($c)
            .by(() => "d");
        for (let i = 0; i < ITERATIONS; i++) {
            await $d();
        }
    });

    it("resolve many cached singletons in parallel", async () => {
        const $i = provide("i")
            .by(() => "i")
            .persisted();
        const $j = provide("j")
            .by(() => "j")
            .persisted();
        const $k = provide("k")
            .by(() => "k")
            .persisted();
        const $l = provide("l")
            .by(() => "l")
            .persisted();
        const $m = provide("m")
            .by(() => "m")
            .persisted();

        await pMap(
            Array(ITERATIONS).fill(undefined),
            async () => {
                await Promise.all([$i(), $j(), $k(), $l(), $m()]);
            },
            { concurrency: 100 },
        );
    });

    it("resolve a cached provider with deep dependencies", async () => {
        const $a = provide("a")
            .by(() => "a")
            .persisted();
        const $b = provide("b")
            .using($a)
            .by(() => "b")
            .persisted();
        const $c = provide("c")
            .using($b)
            .by(() => "c")
            .persisted();
        const $d = provide("d")
            .using($c)
            .by(() => "d")
            .persisted();
        for (let i = 0; i < ITERATIONS; i++) {
            await $d();
        }
    });

    it("resolve a group of providers with cache", async () => {
        const $a = provide("a")
            .by(() => "a")
            .persisted();
        const $b = provide("b")
            .using($a)
            .by(() => "b")
            .persisted();
        const $c = provide("c")
            .using($b)
            .by(() => "c")
            .persisted();
        const $d = provide("d")
            .using($c)
            .by(() => "d")
            .persisted();

        const $group = group($a, $b, $c, $d);
        for (let i = 0; i < ITERATIONS; i++) {
            await $group();
        }
    });

    it("resolve a group of providers", async () => {
        const $a = provide("a").by(() => "a");
        const $b = provide("b")
            .using($a)
            .by(() => "b");
        const $c = provide("c")
            .using($b)
            .by(() => "c");
        const $d = provide("d")
            .using($c)
            .by(() => "d");

        const $group = group($a, $b, $c, $d);
        for (let i = 0; i < ITERATIONS; i++) {
            await $group();
        }
    });
});
