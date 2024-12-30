import { describe, it, expect, vi } from "vitest";
import { provide, select, scope } from "../src";

describe("provider", () => {
    describe("creation", () => {
        it("should create", () => {
            const $first = provide("fist");

            expect($first).not.toBe(undefined);
        });

        it("should create with configuration as parameter", () => {
            const $first = provide("first", {
                resolver: () => "first",
            });

            const $second = provide("second", {
                dependencies: [$first],
                resolver: () => "second",
                defaultCacheKey: "key",
            });

            expect($second).not.toBe(undefined);
        });

        it("should create with builder methods", () => {
            const $first = provide("first", {
                resolver: () => "first",
            });

            const $second = $first
                .as("second")
                .use($first)
                .by(() => "second")
                .singleton();

            expect($second).not.toBe(undefined);
        });
    });

    describe("resolution", () => {
        it("should resolve an empty object without resolver", async () => {
            const $first = provide("fist");

            const first = await $first();

            expect(first).toStrictEqual({});
        });

        it("should resolve without dependencies", async () => {
            const $first = provide("first").by(() => "first");

            const first = await $first();

            expect(first).toBe("first");
        });

        it("should resolve with dependencies", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");

            const second = await $second();

            expect(second).toBe("firstsecond");
        });

        it("should complete", async () => {
            const firstResolver = vi.fn(() => "first");

            const $first = provide("first").by(firstResolver);
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");

            const second = await $second.complete({
                first: "FIRST",
            });

            expect(second).toBe("FIRSTsecond");
            expect(firstResolver).toBeCalledTimes(0);
        });
    });

    describe("cache", () => {
        it("should cache by resolution", async () => {
            const $first = provide("first").by(() => "first");

            await $first("key");

            expect(await $first.cache.get("key")?.resolution).toBe("first");
        });

        it("should cache by set", async () => {
            const $first = provide("first").by(() => "first");

            $first.cache.set("key", Promise.resolve("first"));

            expect(await $first.cache.get("key")?.resolution).toBe("first");
        });

        it("should dispose all", async () => {
            const $first = provide("first").by(() => "first");

            await $first("key");
            await $first("lock");
            $first.cache.dispose();

            expect($first.cache.get("key")).toBe(undefined);
            expect($first.cache.get("lock")).toBe(undefined);
        });

        it("should dispose one", async () => {
            const $first = provide("first").by(() => "first");

            await $first("key");
            await $first("lock");
            $first.cache.dispose("key");

            expect($first.cache.get("key")).toBe(undefined);
            expect($first.cache.get("lock")).not.toBe(undefined);
        });

        it("should return all", async () => {
            const $first = provide("first").by(() => "first");

            await $first("key");
            await $first("lock");

            const allCachedInstances = await Promise.all(
                $first.cache.all().map(async (c) => await c.resolution),
            );

            expect(allCachedInstances).toStrictEqual(["first", "first"]);
        });

        it("should use or override default cache key", async () => {
            const $first = provide("first")
                .by(() => ({}))
                .singleton("key");

            const first1 = await $first();
            const first2 = await $first();
            const first3 = await $first("different");

            expect(first1).toBe(first2);
            expect(first3).not.toBe(first1);
            expect(Array.from($first.cache.map.keys())).toStrictEqual([
                "key",
                "different",
            ]);
        });

        it("should complete and cache", async () => {
            const firstResolver = vi.fn(() => "first");

            const $first = provide("first").by(firstResolver);
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");

            const second = await $second.complete(
                {
                    first: "FIRST",
                },
                "key",
            );

            expect(second).toBe("FIRSTsecond");
            expect(firstResolver).toBeCalledTimes(0);
            expect(await $second.cache.get("key")?.resolution).toBe(
                "FIRSTsecond",
            );
        });
    });

    describe("mocking", () => {
        it("should mock direct dependencies", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");
            const $third = provide("third")
                .use($first, $second)
                .by((deps) => deps.first + deps.second + "third");

            const $firstMock = provide("first").by(() => "firstMock");
            const $secondMock = provide("second").by(() => "secondMock");

            const $thirdWithMocks = $third.mock($firstMock, $secondMock);
            const thirdWithMocks = await $thirdWithMocks();

            expect($thirdWithMocks.dependencies[0]).toBe($firstMock);
            expect($thirdWithMocks.dependencies[1]).toBe($secondMock);
            expect(thirdWithMocks).toBe("firstMocksecondMockthird");
        });

        it("should mock transitive dependencies", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");
            const $third = provide("third")
                .use($second)
                .by((deps) => deps.second + "third");

            const $firstMock = provide("first").by(() => "firstMock");

            const $thirdWithMocks = $third.mock($firstMock);
            const thirdWithMocks = await $thirdWithMocks();

            expect($thirdWithMocks.dependencies[0].dependencies[0]).toBe(
                $firstMock,
            );
            expect(thirdWithMocks).toBe("firstMocksecondthird");
        });
    });

    describe("cloning and isolation", () => {
        it("should clone and keep references", () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by(() => "second");

            const $clonedSecond = $second.clone();

            expect($clonedSecond).not.toBe($second);
            expect($clonedSecond.dependencies[0]).toBe($first);
        });

        it("should isolate into functionally similar graph", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");
            const $third = provide("third")
                .use($second)
                .by((deps) => deps.second + "third");

            const $isolatedThird = $third.isolate();
            const third = await $isolatedThird();

            expect($isolatedThird).not.toBe($third);
            expect($isolatedThird.dependencies[0]).not.toBe($second);
            expect($isolatedThird.dependencies[0].dependencies[0]).not.toBe(
                $first,
            );
            expect(third).toBe("firstsecondthird");
        });
    });

    describe("lifecycle", () => {
        it("should register listeners", () => {
            const $first = provide("first").by(() => "first");

            const startListener = () => {};
            const stopListener = () => {};

            $first.lifecycle.onStart(startListener);
            $first.lifecycle.onStop(stopListener);

            expect($first.lifecycle.startEventListeners).toStrictEqual([
                startListener,
            ]);
            expect($first.lifecycle.stopEventListeners).toStrictEqual([
                stopListener,
            ]);
        });

        it("should register listeners inside a resolver", async () => {
            const startListener = () => {};
            const stopListener = () => {};

            const $first = provide("first").by((_, lc) => {
                lc.onStart(startListener);
                lc.onStop(stopListener);

                return "first";
            });

            await $first();

            expect($first.lifecycle.startEventListeners).toStrictEqual([
                startListener,
            ]);
            expect($first.lifecycle.stopEventListeners).toStrictEqual([
                stopListener,
            ]);
        });

        it("should fire events and call listeners", async () => {
            const $first = provide("first").by(() => "first");

            const startListener = vi.fn(() => {});
            const stopListener = vi.fn(() => {});

            $first.lifecycle.onStart(startListener);
            $first.lifecycle.onStop(stopListener);

            await $first.lifecycle.start();
            await $first.lifecycle.stop();

            expect(startListener).toBeCalledTimes(1);
            expect(stopListener).toBeCalledTimes(1);
        });
    });

    describe("onEach", () => {
        it("should register and call instance callback on each resolution", async () => {
            const instanceCallback = vi.fn();

            const $first = provide("first").by(() => "first");

            $first.onEach(instanceCallback);

            await $first();

            expect(instanceCallback).toBeCalledTimes(1);
        });
    });
});

describe("provider group", () => {
    describe("creation", () => {
        it("should create and interprete", () => {
            const $first = provide("first");
            const $second = provide("second");
            const $third = provide("third");
            const $all = select($first, $second, $third);

            expect($all).not.toBe(undefined);
            expect($all.list).toStrictEqual([$first, $second, $third]);
            expect($all.map).toStrictEqual({
                first: $first,
                second: $second,
                third: $third,
            });
        });
    });

    describe("resolution", () => {
        it("should build", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");

            const $all = select($first, $second);
            const all = await $all();

            expect(all).toStrictEqual({
                first: "first",
                second: "second",
            });
        });

        it("should build and cache", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");

            const $all = select($first, $second);
            const all = await $all("key");

            expect(all).toStrictEqual({
                first: "first",
                second: "second",
            });
            expect(await $first.cache.get("key")?.resolution).toBe("first");
            expect(await $second.cache.get("key")?.resolution).toBe("second");
        });
    });

    describe("mocking", () => {
        it("should mock providers in the list", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");
            const $third = provide("third")
                .use($first)
                .by((deps) => deps.first + "third");

            const $all = select($first, $second, $third);

            const $secondMock = $second.by((deps) => deps.first + "secondMock");
            const $thirdMock = $third.by((deps) => deps.first + "thirdMock");

            const $allWithMocks = $all.mock($secondMock, $thirdMock);
            const allWithMocks = await $allWithMocks();

            expect($allWithMocks.map.first).toBe($first);
            expect($allWithMocks.map.second).toBe($secondMock);
            expect($allWithMocks.map.third).toBe($thirdMock);
            expect(allWithMocks).toStrictEqual({
                first: "first",
                second: "firstsecondMock",
                third: "firstthirdMock",
            });
        });

        it("should mock transitive dependencies", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");
            const $third = provide("third")
                .use($first)
                .by((deps) => deps.first + "third");

            const $all = select($first, $second, $third);

            const $firstMock = $first.by(() => "firstMock");

            const $allWithMock = $all.mock($firstMock);
            const allWithMock = await $allWithMock();

            expect($allWithMock.map.first).toBe($firstMock);
            expect(allWithMock).toStrictEqual({
                first: "firstMock",
                second: "firstMocksecond",
                third: "firstMockthird",
            });
        });
    });

    describe("isolation", () => {
        it("should isolate", () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second")
                .use($first)
                .by((deps) => deps.first + "second");
            const $third = provide("third")
                .use($first)
                .by((deps) => deps.first + "third");

            const $all = select($first, $second, $third);
            const $allIsolated = $all.isolate();

            expect($allIsolated.map.first).not.toBe($first);
            expect($allIsolated.map.second).not.toBe($second);
            expect($allIsolated.map.third).not.toBe($third);
            expect($allIsolated.map.second.dependencies[0]).toBe(
                $allIsolated.map.first,
            );
            expect($allIsolated.map.third.dependencies[0]).toBe(
                $allIsolated.map.first,
            );
        });
    });

    describe("lifecycle", () => {
        it("should call own listeners only on build", async () => {
            const groupStartListener = vi.fn(() => {});

            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");
            const $all = select($first, $second);

            $all.lifecycle.onStart(groupStartListener);

            await $all.lifecycle.start();

            expect(groupStartListener).toBeCalledTimes(1);
        });

        it("should propagate event on providers", async () => {
            const firstStartListener = vi.fn(() => {});
            const secondStartListener = vi.fn(() => {});
            const groupStartListener = vi.fn(() => {});
            const firstStopListener = vi.fn(() => {});
            const secondStopListener = vi.fn(() => {});
            const groupStopListener = vi.fn(() => {});

            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");
            const $all = select($first, $second);

            $first.lifecycle.onStart(firstStartListener);
            $second.lifecycle.onStart(secondStartListener);
            $all.lifecycle.onStart(groupStartListener);
            $first.lifecycle.onStop(firstStopListener);
            $second.lifecycle.onStop(secondStopListener);
            $all.lifecycle.onStop(groupStopListener);

            await $all.lifecycle.start();
            await $all.lifecycle.stop();

            expect(groupStartListener).toBeCalledTimes(1);
            expect(firstStartListener).toBeCalledTimes(1);
            expect(secondStartListener).toBeCalledTimes(1);
            expect(groupStopListener).toBeCalledTimes(1);
            expect(firstStopListener).toBeCalledTimes(1);
            expect(secondStopListener).toBeCalledTimes(1);
        });
    });

    describe("onEach", () => {
        it("should register and call instance callback on each build", async () => {
            const instanceMapCallback = vi.fn();

            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");
            const $all = select($first, $second);

            $all.onEach(instanceMapCallback);
            await $all();

            expect(instanceMapCallback).toBeCalledTimes(1);
        });
    });

    describe("disposeEachCache", () => {
        it("should dispose cache of each provider", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");
            const $all = select($first, $second);

            await $all("key");
            $all.disposeEachCache();

            expect($first.cache.all().length).toBe(0);
            expect($second.cache.all().length).toBe(0);
        });
    });
});

describe("provider scope", () => {
    describe("creation", () => {
        it("should create", () => {
            const $all = scope();

            expect($all).not.toBe(undefined);
        });

        it("should create with predefined providers", () => {
            const $all = scope(provide("first"), provide("second"));

            expect($all).not.toBe(undefined);
        });

        it("should create and add providers", () => {
            const $all = scope();

            const $first = $all.add(provide("first"));
            const $second = $all.add(provide("second"));

            expect($first).not.toBe(undefined);
            expect($second).not.toBe(undefined);
            expect($all.providers).toStrictEqual([$first, $second]);
        });

        it("should create and add multiple providers at once", () => {
            const $all = scope();

            const $firstAndSecond = $all.add(
                provide("first"),
                provide("second"),
            );

            expect($firstAndSecond).not.toBe(undefined);
            expect($all.providers).toStrictEqual([
                $firstAndSecond.list[0],
                $firstAndSecond.list[1],
            ]);
        });
    });

    describe("lifecycle", () => {
        it("should call own listeners only on build", async () => {
            const groupStartListener = vi.fn(() => {});

            const $all = scope();
            $all.add(provide("first").by(() => "first"));
            $all.add(provide("second").by(() => "second"));

            $all.lifecycle.onStart(groupStartListener);

            await $all.lifecycle.start();

            expect(groupStartListener).toBeCalledTimes(1);
        });

        it("should propagate event on providers", async () => {
            const firstStartListener = vi.fn(() => {});
            const secondStartListener = vi.fn(() => {});
            const groupStartListener = vi.fn(() => {});

            const firstStopListener = vi.fn(() => {});
            const secondStopListener = vi.fn(() => {});
            const groupStopListener = vi.fn(() => {});

            const $all = scope();
            const $first = $all.add(provide("first").by(() => "first"));
            const $second = $all.add(provide("second").by(() => "second"));

            $first.lifecycle.onStart(firstStartListener);
            $second.lifecycle.onStart(secondStartListener);
            $all.lifecycle.onStart(groupStartListener);

            $first.lifecycle.onStop(firstStopListener);
            $second.lifecycle.onStop(secondStopListener);
            $all.lifecycle.onStop(groupStopListener);

            await $all.lifecycle.start();
            await $all.lifecycle.stop();

            expect(groupStartListener).toBeCalledTimes(1);
            expect(firstStartListener).toBeCalledTimes(1);
            expect(secondStartListener).toBeCalledTimes(1);

            expect(groupStopListener).toBeCalledTimes(1);
            expect(firstStopListener).toBeCalledTimes(1);
            expect(secondStopListener).toBeCalledTimes(1);
        });
    });

    describe("disposeEachCache", () => {
        it("should dispose cache of each provider", async () => {
            const $first = provide("first").by(() => "first");
            const $second = provide("second").by(() => "second");
            const $all = scope($first, $second);

            await $first("key");
            await $second("key");
            $all.disposeEachCache();

            expect($first.cache.all().length).toBe(0);
            expect($second.cache.all().length).toBe(0);
        });
    });
});
