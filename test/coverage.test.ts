import { describe, it, expect, vi } from "vitest";
import { provide, select } from "../src";

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
                isTransient: true,
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
                .transient()
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

        it("should resolve to the same instance each time when singleton", async () => {
            const $first = provide("first").by(() => ({}));

            const first1 = await $first();
            const first2 = await $first();

            expect(first1).toBe(first2);
        });

        it("should resolve a new instance each time when transient", async () => {
            const $first = provide("first")
                .by(() => ({}))
                .transient();

            const first1 = await $first();
            const first2 = await $first();

            expect(first1).not.toBe(first2);
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
});
