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

/**
 *  A function that creates an instance.
 */
type Resolver<C extends Record<string, any>, I> = (
    container: C,
) => MaybePromise<I>;

type InferProviderInstance<P extends ProviderShape> =
    P extends Provider<infer I, any, any> ? I : never;

type MapProvidersOutputsById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: InferProviderInstance<P>;
};

type CachingOpts<Instance> = {
    /**
     *  A custom disposer.
     */
    disposer?: Disposer<Instance>;
    /**
     * An instance lifetime in milliseconds.
     */
    ttl?: number;
};

/**
 * Additional caching options for multiple instances.
 */
type UnrelatedCachingOpts = {
    /**
     * An instance lifetime in milliseconds.
     */
    ttl?: number;
};

/**
 * A structure that creates and stores instances by resolving its dependencies.
 */
type Provider<
    Instance,
    Id extends string,
    Dependencies extends ProviderShape[],
> = {
    /**
     * Resolves an instance by calling its resolver with dependencies.
     * ```ts
     * const instance = await provider();
     * ```
     *
     * Can be cached for later retrieval.
     * ```ts
     * const instance = await provider("cacheKey", {
     *     ttl: 1000,
     *     dispose: instance => instance.doSomething()
     * });
     * ```
     *
     * @param cacheKey A key for caching.
     * @param cacheOpts Caching options.
     */
    (cacheKey?: string, cacheOpts?: CachingOpts<Instance>): Promise<Instance>;
    /**
     * Unique identifier.
     */
    id: Id;
    /**
     * A list of dependency providers.
     */
    dependencies: Dependencies;
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
     * @resolver A function that creates an instance.
     */
    by<NewInstance>(
        resolver: Resolver<
            Prettify<MapProvidersOutputsById<Dependencies>>,
            NewInstance
        >,
    ): Provider<NewInstance, Id, Dependencies>;
    /**
     * Creates a new provider with a modified list of dependencies. The provider created by this method must define a new resolver because the set of dependency interfaces changes.
     *
     * @param dependencies A list of dependency providers.
     */
    using<NewDependencies extends ProviderShape[]>(
        ...dependencies: NewDependencies
    ): Provider<Instance, Id, NewDependencies>;
    /**
     * Creates a new provider with a modified disposer.
     *
     * @param A function that is called when an instance is disposed.
     */
    withDisposer(
        disposer?: Disposer<Instance>,
    ): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with a modified default cache key. When a default cache key is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .persisted("key")
     *
     * await provider() === await provider()
     * await provider() !== await provider("different")
     * ```
     *
     * @param cacheKey Cache key. Defaults to `"singleton"` if not specified.
     */
    persisted(cacheKey?: string): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with a modified default cached instance lifetime. When the cached instance lifetime is set to default, all instances will be cached with that lifetime unless a different lifetime is intentionally set.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .temporary(1_000)
     *
     * await provider("key1") // cached for 1 second
     * await provider("key2", { ttl: 2_000 }) // cached for 2 seconds
     * ```
     *
     * @param An instance lifetime in milliseconds.
     */
    temporary(ttl: number): Provider<Instance, Id, Dependencies>;
    /**
     * Removes all instances from the cache, calling their disposers. Will attempt to dispose only one entity if a cache key was specified.
     *
     * @param cacheKey A cache key of a specific instance.
     */
    dispose(cacheKey?: string): Promise<void>;
    /**
     * Creates a new provider by replacing dependency providers with compatible mocks, traversing an entire provider context graph. A replaced provider is identified by a unique identifier.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .using($first)
     *     .by(createSecond)
     * const $third = provide("third")
     *     .using($second)
     *     .by(createThird)
     *
     * const $thirdWithMockedFirst = $third
     *     .mock(provide("first").by(createFakeFirst))
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
     * Caches an already existing instance under the specified key.
     * If there is already a cached instance under the key,
     * it will be disposed and replaced with a new one.
     *
     * @param instance An instance to cache.
     * @param cacheKey A key under which the instance will be cached.
     * @param cacheOpts Optional caching options.
     */
    mount(
        instance: Instance,
        cacheKey: string,
        cacheOpts?: CachingOpts<Instance>,
    ): Promise<Instance>;
    /**
     * Resolves remaining dependencies based on the container
     * portion already provided. If there is already
     * a cached instance under the key, it will be disposed
     * and replaced with a new one.
     *
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .by(createSecond)
     * const $third = provide("third")
     *     .using($first, $second)
     *     .by(createThird)
     *
     * const third = await $service.complete(
     *     { first: createFirst(...) }
     * )
     * ```
     *
     * @param resolvedPart Already resolved part of dependency container.
     * @param cacheKey A key for caching.
     * @param cacheOpts Caching options:
     */
    complete(
        resolvedPart: Partial<MapProvidersOutputsById<Dependencies>>,
        cacheKey?: string,
        cacheOpts?: CachingOpts<Instance>,
    ): Promise<Instance>;
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
     *     .using($first)
     *     .by(createSecond)
     *
     * const $isolatedSecond = $second.isolate()
     *
     * $isolatedSecond !== $second
     * $isolatedSecond.dependencies[0].id !== $first
     * ```
     */
    isolate(): Provider<Instance, Id, Dependencies>;
    /**
     * Returns debugging information.
     */
    inspect(): {
        cache: ResolutionCache<Instance>;
    };
};

type ProviderShape = Provider<any, string, any[]>;

const makePhonyResolver =
    <Instance>() =>
    () =>
        Promise.resolve({} as Instance);

/**
 * Creates a provider, a structure that creates and stores instances by resolving its dependencies.
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
            Instance
        >;
        /**
         * When this function is set, all instances will be cached with that disposer unless a different lifetime is intentionally set.
         */
        disposer?: Disposer<Instance>;
        /**
         * When this string is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.
         */
        defaultCacheKey?: string;
        /**
         * When this number is set, all instances will be cached with that lifetime unless a different lifetime is intentionally set.
         */
        defaultCacheTTL?: number;
    },
) => {
    type ProviderType = Provider<Instance, Id, Dependencies>;

    const dependencies = (
        opts?.dependencies ? unique(opts.dependencies) : []
    ) as Dependencies;
    const resolver = opts?.resolver
        ? async (container: Parameters<typeof opts.resolver>[0]) =>
              opts.resolver!(container)
        : makePhonyResolver<Instance>();
    const disposer = opts?.disposer;
    const defaultCacheKey = opts?.defaultCacheKey;
    const defaultCacheTTL = opts?.defaultCacheTTL;
    const cache = createResolutionCache<Instance>();

    const resolveWithDependencies = async () =>
        resolver(await group(...dependencies)());

    const cacheResolution = (
        key: string,
        resolution: Promise<Instance>,
        cacheOpts?: CachingOpts<Instance>,
    ) =>
        cache.set({
            key,
            resolution,
            disposer: cacheOpts?.disposer || disposer,
            ttl: cacheOpts?.ttl || defaultCacheTTL,
        });

    const resolve: InferCallSignature<ProviderType> = async (
        cacheKey,
        cacheOpts,
    ) => {
        cacheKey ??= defaultCacheKey;

        if (cacheKey) {
            const cachedResolution = cache.get(cacheKey);
            if (cachedResolution) return cachedResolution.resolution;

            const resolution = resolveWithDependencies();
            cacheResolution(cacheKey, resolution, cacheOpts);

            return resolution;
        }

        return resolveWithDependencies();
    };

    const complete: ProviderType["complete"] = async (
        resolvedPart,
        cacheKey,
        cacheOpts,
    ) => {
        cacheKey ??= defaultCacheKey;

        const resolvedDepedencyIds = Object.keys(resolvedPart);
        const missingDependencies = dependencies.filter(
            (p) => !resolvedDepedencyIds.includes(p.id),
        );
        const missingPart = await group(...missingDependencies)();
        const resolution = resolver({
            ...resolvedPart,
            ...missingPart,
        });

        if (cacheKey) {
            await cache.get(cacheKey)?.dispose();
            cacheResolution(cacheKey, resolution, cacheOpts);
        }

        return resolution;
    };

    const mount: ProviderType["mount"] = async (
        instance,
        cacheKey,
        cacheOpts,
    ) => {
        await cache.get(cacheKey)?.dispose();

        const resolution = Promise.resolve(instance);
        cacheResolution(cacheKey, resolution, cacheOpts);

        return resolution;
    };

    const dispose: ProviderType["dispose"] = async (cacheKey) => {
        if (cacheKey) return cache.get(cacheKey)?.dispose();
        await Promise.all(
            cache.all().map((resolution) => resolution.dispose()),
        );
    };

    const inspect: ProviderType["inspect"] = () => ({
        cache,
    });

    const optsToSave = {
        defaultCacheKey,
        defaultCacheTTL,
    };

    const as: ProviderType["as"] = (id) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            disposer,
        });

    const by: ProviderType["by"] = (resolver) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
        });

    const using: ProviderType["using"] = (...dependencies) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
        });

    const withDisposer: ProviderType["withDisposer"] = (disposer) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            disposer,
        });

    const persisted: ProviderType["persisted"] = (cacheKey) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            disposer,
            defaultCacheKey: cacheKey || SINGLETON_CACHE_KEY,
        });

    const temporary: ProviderType["temporary"] = (ttl) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            disposer,
            defaultCacheTTL: ttl,
        });

    const clone: ProviderType["clone"] = () =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            disposer,
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
            disposer,
        });

    const identity = () =>
        Object.assign(resolve, instanceWithoutCallable) as ProviderType;

    const isolate: ProviderType["isolate"] = () =>
        createProviderCloneResolver()(identity()) as ProviderType;

    const instanceWithoutCallable: OmitCallSignature<ProviderType> = {
        id,
        dependencies,
        complete,
        mount,
        dispose,
        inspect,
        as,
        by,
        using,
        withDisposer,
        persisted,
        temporary,
        clone,
        mock,
        isolate,
    };

    return identity();
};

export const provide = createProvider;

/**
 * Function called upon disposition.
 */
type Disposer<I> = (instance: I) => any;

type CachedResolution<Instance> = {
    resolution: Promise<Instance>;
    disposeTimer?: NodeJS.Timeout;
    dispose(): Promise<void>;
};

const SINGLETON_CACHE_KEY = "singleton";

const createCachedResolution = <Instance>(opts: {
    resolution: Promise<Instance>;
    disposer?: Disposer<Instance>;
    ttl?: number;
}): CachedResolution<Instance> => {
    let disposeTimer: NodeJS.Timeout | undefined;

    const stopDisposeTimer = () =>
        (disposeTimer &&= void clearTimeout(disposeTimer));

    if (opts.disposer && opts.ttl)
        disposeTimer = setTimeout(
            async () => opts.disposer!(await opts.resolution),
            opts.ttl,
        );

    return {
        resolution: opts.resolution,
        disposeTimer,
        async dispose() {
            stopDisposeTimer();
            await opts.disposer?.(await opts.resolution);
        },
    };
};

type ResolutionCache<Instance> = {
    map: Map<string, CachedResolution<Instance>>;
    get(key: string): CachedResolution<Instance> | undefined;
    set(opts: {
        key: string;
        resolution: Promise<Instance>;
        disposer?: Disposer<Instance>;
        ttl?: number;
    }): void;
    all(): CachedResolution<Instance>[];
};

const createResolutionCache = <Instance>(): ResolutionCache<Instance> => {
    const map = new Map<string, CachedResolution<Instance>>();

    const makeEntryCleaner =
        (keyToDelete: string, disposer?: Disposer<Instance>) =>
        async (instance: Instance) => {
            await disposer?.(instance);
            map.delete(keyToDelete);
        };

    return {
        map,
        get(key) {
            return map.get(key);
        },
        set(opts) {
            const cachedResolution = createCachedResolution({
                ...opts,
                disposer: makeEntryCleaner(opts.key, opts.disposer),
            });

            map.set(opts.key, cachedResolution);
        },
        all() {
            return Array.from(map.values());
        },
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

/**
 * A set of providers grouped together into a common context.
 */
type ProviderGroup<Providers extends ProviderShape[]> = {
    /**
     * Resolves instances of all providers from a list, producing an instance map. Supports simplified caching for all instances.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .by(createSecond)
     *
     * const all = group($first, $second)()
     *
     * all === {
     *     first: ..., // instance of the first
     *     second: ... // intance of the second
     * }
     * ```
     *
     * @param cacheKey A key under which all instances will be cached.
     * @param cacheOpts Caching options.
     */
    (
        cacheKey?: string,
        cacheOpts?: UnrelatedCachingOpts,
    ): Promise<MapProvidersOutputsById<Providers>>;
    /**
     * A list of providers.
     */
    list: Providers;
    /**
     * A map of providers.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .by(createSecond)
     *
     * const $allMap = group($first, $second).map
     *
     * $allMap.first.id === "first"
     * $allMap.second.id === "second"
     * ```
     */
    map: Prettify<MapProvidersById<Providers>>;
    /**
     * Creates a new group with a modified list of providers, to which new ones have been added.
     *
     * @param providers A list of providers to add.
     */
    add<AddedProviders extends ProviderShape[]>(
        ...providers: AddedProviders
    ): ProviderGroup<[...Providers, ...AddedProviders]>;
    /**
     * Creates a new group with a modified list of providers, to which providers from another group were added.
     *
     * @param group A group to be concatenated.
     */
    concat<OtherProviders extends ProviderShape[]>(
        group: ProviderGroup<OtherProviders>,
    ): ProviderGroup<[...Providers, ...OtherProviders]>;
    /**
     * Call dispose on all providers from a list.
     *
     * @param cacheKey A cache key that will be used in all dispositions.
     */
    dispose(cacheKey?: string): Promise<void>;
    /**
     * * Clones a known graph into an identical one, returning a group with the same set of interfaces.
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
     * const $allIsolated = group($first, $second, $third).isolate()
     *
     * Object.is(
     *     $allIsolated.$second.dependencies[0],
     *     $allIsolated.$third.dependencies[0]
     * ) === true
     * // the same thing with just `group($second, $third)`
     * ```
     */
    isolate(): ProviderGroup<Providers>;
    /**
     * Creates a new group by replacing dependency providers with compatible mocks, traversing an entire available graph. A replaced provider is identified by a unique identifier.
     *
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
     * const $all = group($first, $second, $third)
     * const $allWithMockedFirst = $all.mock(
     *     provide("first").by(createFakeFirst)
     * )
     * const $mockedFirst = $allWithMockedFirst.map.first
     *
     * $mockedfirst !== $first
     * $allWithMockedFirst.map.second.dependencies[0] === $mockedFirst
     * $allWithMockedFirst.map.third.dependencies[0] === $mockedFirst
     * ```
     *
     * @param providers A list of mock dependency providers.
     */
    mock(
        ...providers: SomeOf<InferContext<Providers>>
    ): ProviderGroup<Providers>;
};

/**
 * Creates a provider group, a set of providers grouped together into a common context.
 *
 * @param providers A list of providers to group.
 */
const createGroup = <Providers extends ProviderShape[]>(
    ...providers: Providers
) => {
    type GroupType = ProviderGroup<Providers>;

    const list = unique(providers);

    const map = Object.fromEntries(
        providers.map((p) => [p.id, p]),
    ) as MapProvidersById<Providers>;

    const build: InferCallSignature<GroupType> = async (cacheKey, opts) =>
        Object.fromEntries(
            await Promise.all(
                list.map(async (p) => [p.id, await p(cacheKey, opts)]),
            ),
        );

    const dispose: GroupType["dispose"] = async (cacheKey) => {
        await Promise.all(list.map((p) => p.dispose(cacheKey)));
    };

    const add: GroupType["add"] = (...providers) =>
        createGroup(...list, ...providers);

    const concat: GroupType["concat"] = (group) =>
        createGroup(...list, ...group.list);

    const isolate: GroupType["isolate"] = () => {
        const resolveClone = createProviderCloneResolver();

        return createGroup(...(list.map(resolveClone) as Providers));
    };

    const mock: GroupType["mock"] = (...mockProviders) => {
        const mockMap = Object.fromEntries(
            mockProviders.map((p: any) => [p.id, p]),
        );

        return createGroup(
            ...(list.map(createProviderMockResolver(mockMap)) as Providers),
        );
    };

    const instanceCallable = build;

    const instanceWithoutCallable: OmitCallSignature<GroupType> = {
        dispose,
        list,
        get map() {
            return map as Prettify<MapProvidersById<Providers>>;
        },
        add,
        concat,
        isolate,
        mock,
    };

    return Object.assign(
        instanceCallable,
        instanceWithoutCallable,
    ) as GroupType;
};

export const group = createGroup;
