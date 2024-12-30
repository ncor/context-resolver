type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
type MaybePromise<T> = T | Promise<T>;
type OmitCallSignature<T> = {
    [K in keyof T as K extends string ? K : never]: T[K];
};
type InferCallSignature<T> = T extends { (...args: infer A): infer R }
    ? (...args: A) => R
    : never;
type SomeOf<T extends any[]> = T[number][];
type IsTuple<T> = T extends [infer _, ...infer Rest]
    ? Rest["length"] extends number
        ? true
        : false
    : false;

type Unique<T extends readonly any[], Seen = never> = T extends [
    infer First,
    ...infer Rest,
]
    ? First extends Seen
        ? never
        : [First, ...Unique<Rest, Seen | First>]
    : [];

const unique = <T extends any[]>(xs: T) => Array.from(new Set(xs)) as T;

type Resolver<C extends Record<string, any>, I, P> = (
    container: C,
    lifecycle: Lifecycle,
) => MaybePromise<I>;

type InferProviderInstance<P extends ProviderShape> =
    P extends Provider<infer I, any, any> ? I : never;

type MapProvidersOutputsById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: InferProviderInstance<P>;
};

type InstanceCallback<Instance> = (instance: Instance) => any;

/**
 * Creates instances by resolving its dependencies.
 */
type Provider<
    Instance,
    Id extends string,
    Dependencies extends ProviderShape[],
> = {
    /**
     * Resolves an instance by calling its resolver with dependencies.
     *
     * @param cacheKey A key under which the instance will be cached.
     */
    (cacheKey?: string): Promise<Instance>;
    /**
     * Unique identifier.
     */
    id: Id;
    /**
     * A list of dependency providers.
     */
    dependencies: Dependencies;
    /**
     * Stores and provides resolutions.
     */
    cache: ResolutionCache<Instance>;
    /**
     * Start and stop event broker.
     */
    lifecycle: Lifecycle;
    /**
     * Creates a new provider with a modified unique identifier.
     *
     * @param id Unique identifier.
     */
    as<NewId extends string>(
        id: NewId,
    ): Provider<Instance, NewId, Dependencies>;
    /**
     * Creates a new provider with a modified resolver.
     *
     * @param resolver A function that creates an instance.
     */
    by<NewInstance>(
        resolver: Resolver<
            Prettify<MapProvidersOutputsById<Dependencies>>,
            NewInstance,
            Provider<NewInstance, Id, Dependencies>
        >,
    ): Provider<NewInstance, Id, Dependencies>;
    withResolver: Provider<Instance, Id, Dependencies>["by"];
    /**
     * Creates a new provider with a modified list of dependencies.
     * A provider created by this method must define a new resolver
     * because this method establishes a new set of provider interfaces.
     * ```ts
     * const $standaloneService = provide("standaloneService")
     *     .by(createStandaloneService)
     *
     * const $serviceWithdeps = $standaloneService
     *     .use($otherService)
     *     .by(createServiceWithDeps)
     * ```
     * In case a resolver is not specified after, it will
     * return an empty object with an `unknown` type:
     * ```ts
     * conts $serviceWithDeps = $standaloneService
     *     .use($otherService)
     *
     * await $serviceWithDeps() === {}
     * ```
     *
     * @param dependencies A list of dependency providers.
     */
    use<NewDependencies extends ProviderShape[]>(
        ...providers: NewDependencies
    ): Provider<Instance, Id, NewDependencies>;
    /**
     * Creates a new provider with a modified default cache key.
     * When a default cache key is set, a first instance will be stored
     * under that key, and all future resolutions will return that entity
     * unless a different key is intentionally specified.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .singleton("key")
     *
     * await provider() === await provider()
     * await provider() !== await provider("different")
     * ```
     *
     * @param cacheKey Cache key. Defaults to `"singleton"` if not specified.
     */
    singleton(key?: string): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider by replacing dependency providers with compatible
     * mocks, traversing an entire provider context graph.
     * A replaced provider is identified by a unique identifier.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .use($first)
     *     .by(createSecond)
     * const $third = provide("third")
     *     .use($second)
     *     .by(createThird)
     *
     * const $firstMock = provide("first")
     *     .by(createFakeFirst)
     * const $thirdWithMockedFirst = $third
     *     .mock(createFakeFirst)
     *
     * $thirdWithMockedFirst
     *     .dependencies[0] // $second
     *     .dependencies[0] !== $first
     * ```
     *
     * @param providers A list of mock dependency providers.
     */
    mock(
        ...providers: IsTuple<Dependencies> extends true
            ? SomeOf<InferContext<Dependencies>>
            : any[]
    ): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with the same properties as an original.
     */
    clone(): Provider<Instance, Id, Dependencies>;
    /**
     * Clones the current provider and its context into
     * an identical transitive graph.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .use($first)
     *     .by(createSecond)
     *
     * const $isolatedSecond = $second.isolate()
     *
     * $isolatedSecond !== $second
     * $isolatedSecond.dependencies[0] !== $first
     * ```
     */
    isolate(): Provider<Instance, Id, Dependencies>;
    /**
     * Registers a callback that will be called with each resolved instance.
     * ```ts
     * $broker.onEach(broker => {
     *     $broker.lifetime.onStart(() => broker.listen())
     *     $broker.lifetime.onStop(() => broker.stop())
     * })
     * ```
     *
     * @param callback A function that will be called with each resolved instance.
     */
    onEach(
        callback: InstanceCallback<Instance>,
    ): Provider<Instance, Id, Dependencies>;
    /**
     * Resolves remaining dependencies based on the container portion
     * already provided.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .by(createSecond)
     * const $third = provide("third")
     *     .use($first, $second)
     *     .by(createThird)
     *
     * const third = await $third.complete(
     *     { first: createFirst(...) }
     * )
     * ```
     *
     * @param resolvedPart Already resolved part of dependency container.
     * @param cacheKey A key under which the instance will be cached.
     */
    complete(
        resolvedPart: Partial<MapProvidersOutputsById<Dependencies>>,
        cacheKey?: string,
    ): Promise<Instance>;
};

type ProviderShape = Provider<any, string, any[]>;

const makePhonyResolver =
    <Instance>() =>
    () =>
        Promise.resolve({} as Instance);

export const defaultCacheKey = "_singleton";

/**
 * Creates a provider, a structure that creates instances
 * by resolving its dependencies.
 * ```ts
 * const $service = createProvider("service", {
 *     dependencies: [$otherService],
 *     resolver: createService,
 *     defaultCache: "key"
 * })
 * ```
 * With `provide` and builder methods:
 * ```ts
 * const $service = provide("service")
 *     .use($otherService)
 *     .by(createService)
 *     .singleton("key")
 * ```
 *
 * @param id Unique identifier.
 * @param opts Configuration.
 */
export const createProvider = <
    Instance,
    Id extends string,
    Dependencies extends ProviderShape[] = [],
>(
    /**
     * Unique identifier.
     */
    id: Id,
    /**
     * Configuration.
     */
    opts?: {
        /**
         * A list of dependency providers.
         */
        dependencies?: Dependencies;
        /**
         * A function that creates an instance.
         */
        resolver?: Resolver<
            Prettify<MapProvidersOutputsById<Dependencies>>,
            Instance,
            Provider<Instance, Id, Dependencies>
        >;
        /**
         * When this string is set, a first instance will be stored
         * under that key, and all future resolutions will return
         * that entity unless a different key is intentionally specified.
         */
        defaultCacheKey?: string;
    },
): Provider<Instance, Id, Dependencies> => {
    type ProviderType = Provider<Instance, Id, Dependencies>;

    const cache = createResolutionCache<Instance>();
    const lifecycle = createLifecycle();

    const resolver = opts?.resolver
        ? async (
              container: Parameters<typeof opts.resolver>[0],
              lifecycle: Lifecycle,
          ) => opts.resolver!(container, lifecycle)
        : makePhonyResolver<Instance>();

    const defaultCacheKey = opts?.defaultCacheKey;

    const dependencies = (
        opts?.dependencies ? unique(opts.dependencies) : []
    ) as Dependencies;
    const container = select(...dependencies);

    const resolveWithDependencies = async () =>
        resolver(await container(), lifecycle);

    const instanceCallbacks: InstanceCallback<Instance>[] = [];

    const resolve: InferCallSignature<ProviderType> = async (cacheKey) => {
        cacheKey ??= defaultCacheKey;

        let resolution = cacheKey && cache.get(cacheKey)?.resolution;

        if (!resolution) {
            resolution = resolveWithDependencies();
            if (cacheKey) cache.set(cacheKey, resolution);
        }

        instanceCallbacks.forEach(async (callback) =>
            callback(await resolution),
        );

        return resolution;
    };

    const onEach: ProviderType["onEach"] = (callback) => {
        instanceCallbacks.push(callback);

        return getSelf();
    };

    const complete: ProviderType["complete"] = async (
        resolvedPart,
        cacheKey,
    ) => {
        cacheKey ??= defaultCacheKey;

        const resolvedDepedencyIds = Object.keys(resolvedPart);
        const missingDependencies = dependencies.filter(
            (p) => !resolvedDepedencyIds.includes(p.id),
        );
        const missingPart = await select(...missingDependencies)();
        const resolution = resolver(
            {
                ...resolvedPart,
                ...missingPart,
            },
            lifecycle,
        );

        if (cacheKey) cache.set(cacheKey, resolution);

        return resolution;
    };

    const optsToSave = {
        defaultCacheKey,
    };

    const as: ProviderType["as"] = (id) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
        });

    const by: ProviderType["by"] = (resolver) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
        });

    const use: ProviderType["use"] = (...dependencies) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
        });

    const singleton: ProviderType["singleton"] = (cacheKey) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            defaultCacheKey: cacheKey || defaultCacheKey,
        });

    const mock: ProviderType["mock"] = (...mockProviders) =>
        createProvider(id, {
            ...optsToSave,
            dependencies: dependencies.map(
                createProviderMockResolver(
                    Object.fromEntries(
                        mockProviders.map((p: any) => [p.id, p]),
                    ),
                ),
            ) as Dependencies,
            resolver,
        });

    const clone: ProviderType["clone"] = () =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
        });

    const isolate: ProviderType["isolate"] = () =>
        createProviderCloneResolver()(getSelf()) as ProviderType;

    let self: ProviderType | undefined;

    const getSelf = () =>
        self || (self = Object.assign(resolve, properties) as ProviderType);

    const properties: OmitCallSignature<ProviderType> = {
        id,
        dependencies,
        cache,
        lifecycle,

        as,
        by,
        withResolver: by,
        use,
        singleton,

        onEach,
        mock,
        complete,
        clone,
        isolate,
    };

    return getSelf();
};

export const provide = createProvider;

type Disposer = () => void;

type CachedResolution<Instance> = {
    resolution: Promise<Instance>;
    dispose: Disposer;
};

/**
 * Stores and provides resolutions.
 */
type ResolutionCache<Instance> = {
    /**
     * Cache.
     */
    map: Map<string, CachedResolution<Instance>>;
    /**
     * Retrieves a possibly existing resolution from the cache.
     *
     * @param key A key of cached resolution.
     */
    get(key: string): CachedResolution<Instance> | undefined;
    /**
     * Saves a resolution in the cache.
     *
     * @param key A key under which the instance will be saved.
     * @param resolution A promise of an instance.
     */
    set(key: string, resolution: Promise<Instance>): void;
    /**
     * Retrieves all existing resolutions from the map.
     */
    all(): CachedResolution<Instance>[];
    /**
     * Removes all resolutions from the cache.
     * Tries to remove one if key parameter is provided.
     *
     * @param A key of cached resolution.
     */
    dispose(key?: string): void;
};

const createCachedResolution = <Instance>(opts: {
    resolution: Promise<Instance>;
    disposer: Disposer;
}): CachedResolution<Instance> => {
    return {
        resolution: opts.resolution,
        dispose() {
            opts.disposer();
        },
    };
};

const createResolutionCache = <Instance>(): ResolutionCache<Instance> => {
    type CacheType = ResolutionCache<Instance>;

    const map = new Map<string, CachedResolution<Instance>>();

    const makeDisposer = (keyToDelete: string) => () => map.delete(keyToDelete);

    const get: CacheType["get"] = (key) => map.get(key);

    const set: CacheType["set"] = (key, resolution) => {
        const cachedResolution = createCachedResolution({
            resolution,
            disposer: makeDisposer(key),
        });

        map.set(key, cachedResolution);
    };

    const all: CacheType["all"] = () => {
        return Array.from(map.values());
    };

    const dispose: CacheType["dispose"] = (key) => {
        if (key) return get(key)?.dispose();
        for (const resolution of all()) resolution.dispose();
    };

    return {
        map,
        get,
        set,
        all,
        dispose,
    };
};

type EventListenerFn = () => MaybePromise<any>;

/**
 * Start and stop event broker.
 */
type Lifecycle = {
    /**
     * A list of start event listeners.
     */
    startEventListeners: EventListenerFn[];
    /**
     * A list of stop event listeners.
     */
    stopEventListeners: EventListenerFn[];
    /**
     * Registers a listener for each start event.
     *
     * @param listener A function that will be called on start event.
     */
    onStart(listener: EventListenerFn): void;
    /**
     * Registers a listener for each stop event.
     */
    onStop(listener: EventListenerFn): void;
    /**
     * Fires a start event, calling all start event listeners.
     */
    start(): Promise<void>;
    /**
     * Fires a stop event, calling all stop event listeners.
     */
    stop(): Promise<void>;
};

const createLifecycle = (): Lifecycle => {
    const startEventListeners: EventListenerFn[] = [];
    const stopEventListeners: EventListenerFn[] = [];

    const onStart: Lifecycle["onStart"] = (listener) =>
        startEventListeners.push(listener);

    const onStop: Lifecycle["onStop"] = (listener) =>
        stopEventListeners.push(listener);

    const start: Lifecycle["start"] = async () => {
        await Promise.all(startEventListeners.map((hook) => hook()));
    };

    const stop: Lifecycle["start"] = async () => {
        await Promise.all(stopEventListeners.map((hook) => hook()));
    };

    return {
        startEventListeners,
        stopEventListeners,
        onStart,
        onStop,
        start,
        stop,
    };
};

type InferContext<Dependencies extends ProviderShape[]> =
    Dependencies extends []
        ? Dependencies
        : Unique<
              [
                  ...Dependencies,
                  ...InferContext<Dependencies[number]["dependencies"]>,
              ]
          >;

const createProviderCloneResolver = (
    cloneMap: WeakMap<ProviderShape, ProviderShape> = new WeakMap(),
) => {
    const resolveClone = (provider: ProviderShape) => {
        const alreadyCloned = cloneMap.get(provider);
        if (alreadyCloned) return alreadyCloned;

        let cloned = provider.clone();

        if (cloned.dependencies.length > 0)
            cloned = cloned.mock(...cloned.dependencies.map(resolveClone));

        cloneMap.set(provider, cloned);

        return cloned;
    };

    return resolveClone;
};

const createProviderMockResolver = (mockMap: Record<string, ProviderShape>) => {
    const resolveMock = (provider: ProviderShape) => {
        const mock = mockMap[provider.id];
        if (mock) return mock;

        if (provider.dependencies.length > 0)
            return provider.mock(...provider.dependencies.map(resolveMock));

        return provider;
    };

    return resolveMock;
};

type MapProvidersById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: P;
};

type InstanceMapCallback<InstanceMap> = (map: InstanceMap) => any;

/**
 * Typed set of providers grouped together into a common context.
 */
type ProviderSelection<Providers extends ProviderShape[]> = {
    /**
     * Resolves instances of all providers from a list, producing an instance map.
     * The passed parameters will be applied to every resolution.
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
     *
     * @param cacheKey A key under which all instances will be cached.
     */
    (cacheKey?: string): Promise<MapProvidersOutputsById<Providers>>;
    /**
     * A list of providers.
     */
    list: Providers;
    /**
     * A map of providers by their unique identifier.
     */
    map: Prettify<MapProvidersById<Providers>>;
    /**
     * Start and stop event broker.
     * Each start and stop event will trigger the same event
     * in each provider from the list.
     */
    lifecycle: Lifecycle;
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
     * Calls `dispose` method of each provider cache in the list.
     *
     * @param key A cached instance key.
     */
    disposeEachCache(key?: string): void;
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
const createSelection = <Providers extends ProviderShape[]>(
    ...providers: Providers
): ProviderSelection<Providers> => {
    type SelectionType = ProviderSelection<Providers>;

    const list = unique(providers);

    const map = Object.fromEntries(
        providers.map((p) => [p.id, p]),
    ) as MapProvidersById<Providers>;

    const lifecycle = createLifecycle();

    lifecycle.onStart(() => list.forEach((p) => p.lifecycle.start()));
    lifecycle.onStop(() => list.forEach((p) => p.lifecycle.stop()));

    const instanceMapCallbacks: InstanceCallback<
        MapProvidersOutputsById<Providers>
    >[] = [];

    const build: InferCallSignature<SelectionType> = async (cacheKey) => {
        const instanceMap = Object.fromEntries(
            await Promise.all(list.map(async (p) => [p.id, await p(cacheKey)])),
        );

        instanceMapCallbacks.forEach((callback) => callback(instanceMap));

        return instanceMap;
    };

    const onEach: SelectionType["onEach"] = (callback) => {
        instanceMapCallbacks.push(callback);

        return getSelf();
    };

    const disposeEachCache: SelectionType["disposeEachCache"] = (key) => {
        for (const provider of providers) provider.cache.dispose(key);
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
        lifecycle,

        onEach,
        disposeEachCache,
        isolate,
        mock,
    };

    return getSelf();
};

export const select = createSelection;

/**
 * Untyped set of providers for global distribution of
 * lifecycle events and cache disposition.
 */
type ProviderScope = {
    /**
     * A list of registered providers.
     */
    providers: ProviderShape[];
    /**
     * Start and stop event broker.
     * Each start and stop event will trigger the same event
     * in each provider in the list.
     */
    lifecycle: Lifecycle;
    /**
     * Adds providers to the list.
     * Returns a provider if there was only one in a list,
     * otherwise returns a selection of providers in the list.
     *
     * @param providers A list of providers to add.
     */
    add<Providers extends ProviderShape[]>(
        ...providers: Providers
    ): Providers extends [infer ProviderType]
        ? ProviderType
        : ProviderSelection<Providers>;
    /**
     * Calls `dispose` method of each provider cache in the scope.
     *
     * @param key A cached instance key.
     */
    disposeEachCache(key?: string): void;
};

/**
 * Creates a provider scope, untyped set of providers for
 * global distribution of lifecycle events and cache disposition.
 *
 * @param providers A list of predefined providers.
 */
export const createScope = (...providers: ProviderShape[]) => {
    const lifecycle = createLifecycle();

    const add: ProviderScope["add"] = <Providers extends ProviderShape[]>(
        ...providersToAdd: Providers
    ) => {
        providers.push(...providersToAdd);

        providersToAdd.forEach((provider) => {
            lifecycle.onStart(() => provider.lifecycle.start());
            lifecycle.onStart(() => provider.lifecycle.stop());
        });

        return (
            providersToAdd.length === 1
                ? providersToAdd[0]
                : select(...providersToAdd)
        ) as Providers extends [infer ProviderType]
            ? ProviderType
            : ProviderSelection<Providers>;
    };

    const disposeEachCache: ProviderScope["disposeEachCache"] = (key) => {
        for (const provider of providers) provider.cache.dispose(key);
    };

    return {
        providers,
        lifecycle,
        add,
        disposeEachCache,
    };
};

export const scope = createScope;
