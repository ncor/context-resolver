import { type MapProvidersOutputsById, type ProviderShape } from "./provider";
import {
    createProviderCloneResolver,
    createProviderMockResolver,
    type InferContext,
} from "./traversing";
import {
    type InferCallSignature,
    type OmitCallSignature,
    type SomeOf,
    type Prettify,
    unique,
} from "./helpers";

type MapProvidersById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: P;
};

type InstanceMapCallback<InstanceMap> = (map: InstanceMap) => any;

/**
 * Typed set of providers grouped together into a common context.
 */
export type ProviderSelection<Providers extends ProviderShape[]> = {
    /**
     * Resolves instances of all providers from a list, producing an instance map.
     * ```ts
     * const $all = select($first, $second, $third)
     * const all = $all()
     *
     * all == {
     *     first: ...,
     *     second: ...,
     *     third: ...
     * }
     * ```
     */
    (): Promise<MapProvidersOutputsById<Providers>>;
    /**
     * A list of providers.
     */
    list: Providers;
    /**
     * A map of providers by their unique identifier.
     */
    map: Prettify<MapProvidersById<Providers>>;
    /**
     * Registers a callback that will be called with each resolved instance map.
     * ```ts
     * $all.onEach(all => {
     *     $second.lifecycle.onStart(() =>
     *         console.log(all.second, "started with", all.first)
     *     )
     *     $third.lifecycle.onStart(() =>
     *         console.log(all.third, "started with", all.first)
     *     )
     * })
     * ```
     *
     * @param callback A function that will be called with each
     * resolved instance map.
     */
    onEach(
        callback: InstanceMapCallback<MapProvidersOutputsById<Providers>>,
    ): ProviderSelection<Providers>;
    /**
     * Clones a known graph into an identical one, returning a selection
     * with the same set of interfaces.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .use($first)
     *     .by(createSecond)
     * const $third = provide("third")
     *     .use($first)
     *     .by(createThird)
     *
     * const $all = select($first, $second, $third)
     * const $allIsolated = $all.isolate()
     *
     * Object.is(
     *     $allIsolated.map.$second.dependencies[0],
     *     $allIsolated.map.$third.dependencies[0]
     * ) === true
     * // the same thing with just `select($second, $third)`
     * ```
     */
    isolate(): ProviderSelection<Providers>;
    /**
     * Creates a new selection by replacing dependency providers with
     * compatible mocks, traversing an entire available graph.
     * A replaced provider is identified by a unique identifier.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .using($first)
     *     .by(createSecond)
     * const $third = provide("third")
     *     .using($first)
     *     .by(createThird)
     *
     * const $firstMock = provide("first")
     *     .by(createFakeFirst)
     *
     * const $all = select($first, $second, $third)
     * const $allWithMockedFirst = $all
     *     .mock($firstMock)
     *
     * $allWithMockedFirst.map.first === $firstMock
     * $allWithMockedFirst.map.second.dependencies[0] === $firstMock
     * $allWithMockedFirst.map.third.dependencies[0] === $firstMock
     * ```
     *
     * @param providers A list of mock dependency providers.
     */
    mock(
        ...providers: SomeOf<InferContext<Providers>>
    ): ProviderSelection<Providers>;
};

/**
 * Creates a provider selection, typed set of providers
 * grouped together into a common context.
 *
 * @param providers A list of providers to select.
 */
export const createSelection = <Providers extends ProviderShape[]>(
    ...providers: Providers
): ProviderSelection<Providers> => {
    type SelectionType = ProviderSelection<Providers>;

    const list = unique(providers);

    const map = Object.fromEntries(
        providers.map((p) => [p.id, p]),
    ) as MapProvidersById<Providers>;
    const instanceMapCallbacks: InstanceMapCallback<
        MapProvidersOutputsById<Providers>
    >[] = [];

    const build: InferCallSignature<SelectionType> = async () => {
        const instanceMap = Object.fromEntries(
            await Promise.all(list.map(async (p) => [p.id, await p()])),
        );

        instanceMapCallbacks.forEach((callback) => callback(instanceMap));

        return instanceMap;
    };

    const onEach: SelectionType["onEach"] = (callback) => {
        instanceMapCallbacks.push(callback);

        return getSelf();
    };

    const isolate: SelectionType["isolate"] = () => {
        const resolveClone = createProviderCloneResolver();

        return createSelection(...(list.map(resolveClone) as Providers));
    };

    const mock: SelectionType["mock"] = (...mockProviders) => {
        const mockMap = Object.fromEntries(
            mockProviders.map((p: any) => [p.id, p]),
        );

        return createSelection(
            ...(list.map(createProviderMockResolver(mockMap)) as Providers),
        );
    };

    let self: SelectionType | undefined;

    const getSelf = () =>
        self || (self = Object.assign(build, properties) as SelectionType);

    const properties: OmitCallSignature<SelectionType> = {
        list,
        get map() {
            return map as Prettify<MapProvidersById<Providers>>;
        },

        onEach,
        isolate,
        mock,
    };

    return getSelf();
};

export const select = createSelection;
