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

type ResolverEventHooksInterface = {
    onStart(hook: EventHookFn): void;
    onStop(hook: EventHookFn): void;
};

/**
 * A function that creates an instance.
 */
type Resolver<C extends Record<string, any>, I, P> = (
    container: C,
    hooks: ResolverEventHooksInterface,
) => MaybePromise<I>;

type InferProviderInstance<P extends ProviderShape> =
    P extends Provider<infer I, any, any> ? I : never;

type MapProvidersOutputsById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: InferProviderInstance<P>;
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
     * const service = await $service("key", 1_000)
     * ```
     *
     * @param cacheKey A key under which the instance will be cached.
     * @param ttl A cached instance lifetime in milliseconds.
     */
    (cacheKey?: string, ttl?: number): Promise<Instance>;
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
            NewInstance,
            Provider<NewInstance, Id, Dependencies>
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
     * Creates a new provider with a modified default cache key. When a default cache key is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .once("key")
     *
     * await provider() === await provider()
     * await provider() !== await provider("different")
     * ```
     *
     * @param cacheKey Cache key. Defaults to `"singleton"` if not specified.
     */
    once(cacheKey?: string): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with a modified default cached instance lifetime.
     * When the cached instance lifetime is set to default, all instances
     * will be cached with that lifetime unless a different lifetime is
     * intentionally set.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .temporary(1_000)
     *
     * await provider("key1") // cached for 1 second
     * await provider("key2", { ttl: 2_000 }) // cached for 2 seconds
     * ```
     *
     * @param A cached instance lifetime in milliseconds.
     */
    temporary(ttl: number): Provider<Instance, Id, Dependencies>;
    /**
     * Registers a function that will be called on a start event,
     * returning the current provider.
     * The start event is fired when `.start` method
     * of the current provider is called.
     *
     * @param fn A function that will be called.
     */
    onStart(fn: EventHookFn): Provider<Instance, Id, Dependencies>;
    /**
     * Registers a function that will be called on a stop event,
     * returning the current provider.
     * The stop event is fired when `.stop` method
     * of the current provider is called.
     *
     * @param fn A function that will be called.
     */
    onStop(fn: EventHookFn): Provider<Instance, Id, Dependencies>;
    /**
     * Fires a start event, calling all hook functions of this event
     * and returning a promise that will resolve when
     * all hooks have resolved.
     */
    start(): Promise<void>;
    /**
     * Fires a stop event, calling all hook functions of this event
     * and returning a promise that will resolve when
     * all hooks have resolved.
     * Initiates disposition afterward if `shouldDispose` is `true`.
     *
     * @param fn Determines whether to initiate a disposition afterward.
     */
    stop(shouldDispose?: boolean): Promise<void>;
    /**
     * Removes all instances from the cache.
     */
    dispose(): void;
    /**
     * Creates a new provider by replacing dependency providers with compatible
     * mocks, traversing an entire provider context graph.
     * A replaced provider is identified by a unique identifier.
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
     * Returns a promise of its resolution.
     *
     * @param instance An instance to cache.
     * @param cacheKey A key under which the instance will be cached.
     * @param ttl A cached instance lifetime in milliseconds.
     */
    mount(
        instance: Instance,
        cacheKey: string,
        ttl?: number,
    ): Promise<Instance>;
    /**
     * Resolves remaining dependencies based on the container portion
     * already provided. If there is already a cached instance
     * under the key, it will be disposed and replaced with a new one.
     * ```ts
     * const $first = provide("first")
     *     .by(createFirst)
     * const $second = provide("second")
     *     .by(createSecond)
     * const $third = provide("third")
     *     .using($first, $second)
     *     .by(createThird)
     *
     * cosnt third = await $service.complete(
     *     { first: createFirst(...) }
     * )
     * ```
     *
     * @param resolvedPart Already resolved part of dependency container.
     * @param cacheKey A key under which the instance will be cached.
     * @param ttl A cached instance lifetime in milliseconds.
     */
    complete(
        resolvedPart: Partial<MapProvidersOutputsById<Dependencies>>,
        cacheKey?: string,
        ttl?: number,
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
 * Creates a provider, a structure that creates and stores instances
 * by resolving its dependencies.
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
        /**
         * When this number is set, all instances will be cached with that
         * lifetime unless a different lifetime is intentionally set.
         */
        defaultTTL?: number;
    },
) => {
    type ProviderType = Provider<Instance, Id, Dependencies>;

    const eventManager = createEventManager();

    const resolverEventHooksInterface = {
        onStart: eventManager.registerStartEventHook,
        onStop: eventManager.registerStopEventHook,
    };
    const resolver = opts?.resolver
        ? async (container: Parameters<typeof opts.resolver>[0]) =>
              opts.resolver!(container, resolverEventHooksInterface)
        : makePhonyResolver<Instance>();

    const cache = createResolutionCache<Instance>();
    const defaultCacheKey = opts?.defaultCacheKey;
    const defaultTTL = opts?.defaultTTL;

    const dependencies = (
        opts?.dependencies ? unique(opts.dependencies) : []
    ) as Dependencies;
    const container = group(...dependencies);
    const resolveWithDependencies = async () => resolver(await container());

    const cacheResolution = (
        key: string,
        resolution: Promise<Instance>,
        ttl?: number,
    ) =>
        cache.set({
            key,
            resolution,
            ttl: ttl || defaultTTL,
        });

    const resolve: InferCallSignature<ProviderType> = async (cacheKey, ttl) => {
        cacheKey ??= defaultCacheKey;

        if (cacheKey) {
            const cachedResolution = cache.get(cacheKey);
            if (cachedResolution) return cachedResolution.resolution;

            const resolution = resolveWithDependencies();
            cacheResolution(cacheKey, resolution, ttl);

            return resolution;
        }

        return resolveWithDependencies();
    };

    const complete: ProviderType["complete"] = async (
        resolvedPart,
        cacheKey,
        ttl,
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
            cacheResolution(cacheKey, resolution, ttl);
        }

        return resolution;
    };

    const mount: ProviderType["mount"] = (instance, cacheKey, ttl) => {
        cache.get(cacheKey)?.dispose();

        const resolution = Promise.resolve(instance);
        cacheResolution(cacheKey, resolution, ttl);

        return resolution;
    };

    const inspect: ProviderType["inspect"] = () => ({
        cache,
    });

    const optsToSave = {
        defaultCacheKey,
        defaultTTL,
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

    const using: ProviderType["using"] = (...dependencies) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
        });

    const onStart: ProviderType["onStart"] = (hook) => {
        eventManager.registerStartEventHook(hook);

        return getSelf();
    };

    const onStop: ProviderType["onStop"] = (hook) => {
        eventManager.registerStopEventHook(hook);

        return getSelf();
    };

    const start: ProviderType["stop"] = eventManager.fireStartEvent;

    const stop: ProviderType["stop"] = async (shouldDispose) => {
        await eventManager.fireStopEvent();
        if (shouldDispose) dispose();
    };

    const dispose: ProviderType["dispose"] = () => {
        for (const resolution of cache.all()) resolution.dispose();
    };

    const once: ProviderType["once"] = (cacheKey) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            defaultCacheKey: cacheKey || SINGLETON_CACHE_KEY,
        });

    const temporary: ProviderType["temporary"] = (ttl) =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            defaultTTL: ttl,
        });

    const clone: ProviderType["clone"] = () =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
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

    const isolate: ProviderType["isolate"] = () =>
        createProviderCloneResolver()(getSelf()) as ProviderType;

    let self: ProviderType | undefined;

    const getSelf = () =>
        self || (self = Object.assign(resolve, properties) as ProviderType);

    const properties: OmitCallSignature<ProviderType> = {
        id,
        dependencies,

        as,
        by,
        using,
        once,
        temporary,

        onStart,
        onStop,
        start,
        stop,
        dispose,

        mock,
        mount,
        complete,
        clone,
        isolate,

        inspect,
    };

    return getSelf();
};

export const provide = createProvider;

type Disposer = () => void;

type CachedResolution<Instance> = {
    resolution: Promise<Instance>;
    disposeTimer?: NodeJS.Timeout;
    dispose: Disposer;
};

const SINGLETON_CACHE_KEY = "singleton";

const createCachedResolution = <Instance>(opts: {
    resolution: Promise<Instance>;
    disposer: Disposer;
    ttl?: number;
}): CachedResolution<Instance> => {
    let disposeTimer: NodeJS.Timeout | undefined;

    const stopDisposeTimer = () =>
        (disposeTimer &&= void clearTimeout(disposeTimer));

    if (opts.ttl) disposeTimer = setTimeout(opts.disposer, opts.ttl);

    return {
        resolution: opts.resolution,
        disposeTimer,
        dispose() {
            stopDisposeTimer();
            opts.disposer();
        },
    };
};

type ResolutionCache<Instance> = {
    map: Map<string, CachedResolution<Instance>>;
    get(key: string): CachedResolution<Instance> | undefined;
    set(opts: {
        key: string;
        resolution: Promise<Instance>;
        ttl?: number;
    }): void;
    all(): CachedResolution<Instance>[];
};

const createResolutionCache = <Instance>(): ResolutionCache<Instance> => {
    const map = new Map<string, CachedResolution<Instance>>();

    const makeDisposer = (keyToDelete: string) => () => map.delete(keyToDelete);

    return {
        map,
        get(key) {
            return map.get(key);
        },
        set(opts) {
            const cachedResolution = createCachedResolution({
                ...opts,
                disposer: makeDisposer(opts.key),
            });

            map.set(opts.key, cachedResolution);
        },
        all() {
            return Array.from(map.values());
        },
    };
};

type EventHookFn = () => MaybePromise<any>;

type EventManager = {
    startEventHooks: EventHookFn[];
    stopEventHooks: EventHookFn[];
    registerStartEventHook(hook: EventHookFn): void;
    registerStopEventHook(hook: EventHookFn): void;
    fireStartEvent(): Promise<void>;
    fireStopEvent(): Promise<void>;
};

const createEventManager = () => {
    const startEventHooks: EventHookFn[] = [];
    const stopEventHooks: EventHookFn[] = [];

    const registerStartEventHook: EventManager["registerStartEventHook"] = (
        hook,
    ) => startEventHooks.push(hook);

    const registerStopEventHook: EventManager["registerStopEventHook"] = (
        hook,
    ) => stopEventHooks.push(hook);

    const fireStartEvent: EventManager["fireStartEvent"] = async () => {
        await Promise.all(startEventHooks.map((hook) => hook()));
    };

    const fireStopEvent: EventManager["fireStartEvent"] = async () => {
        await Promise.all(stopEventHooks.map((hook) => hook()));
    };

    return {
        startEventHooks,
        stopEventHooks,
        registerStartEventHook,
        registerStopEventHook,
        fireStartEvent,
        fireStopEvent,
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
     * @param ttl A cached instance lifetime in milliseconds.
     */
    (
        cacheKey?: string,
        ttl?: number,
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
     * Calls `onStart` method of each provider in the list,
     * returning the current group.
     *
     * @param fn Will be passed in method calls.
     */
    onStart(fn: EventHookFn): ProviderGroup<Providers>;
    /**
     * Calls `onStop` method of each provider in the list,
     * returning the current group.
     *
     * @param fn Will be passed in method calls.
     */
    onStop(fn: EventHookFn): ProviderGroup<Providers>;
    /**
     * Calls `start` method of each provider in the list,
     * returning a promise that will resolve when all
     * hooks of all providers have resolved.
     */
    start(): Promise<void>;
    /**
     * Calls `stop` method of each provider in the list,
     * returning a promise that will resolve when all
     * hooks of all providers have resolved.
     *
     * @param shouldDispose Will be passed in method calls.
     */
    stop(shouldDispose?: boolean): Promise<void>;
    /**
     * Calls `dispose` method of each provider in the list.
     */
    dispose(): void;
    /**
     * Clones a known graph into an identical one, returning a group
     * with the same set of interfaces.
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
     * Creates a new group by replacing dependency providers with
     * compatible mocks, traversing an entire available graph.
     * A replaced provider is identified by a unique identifier.
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
 * Creates a provider group, a set of providers
 * grouped together into a common context.
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

    const onStart: GroupType["onStart"] = (hook) => {
        for (const provider of providers) provider.onStart(hook);

        return getSelf();
    };

    const onStop: GroupType["onStop"] = (hook) => {
        for (const provider of providers) provider.onStop(hook);

        return getSelf();
    };

    const start: GroupType["start"] = async () => {
        for (const provider of providers) await provider.start();
    };

    const stop: GroupType["stop"] = async () => {
        for (const provider of providers) await provider.stop();
    };

    const dispose: GroupType["dispose"] = () => {
        for (const provider of providers) provider.dispose();
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

    let self: GroupType | undefined;

    const getSelf = () =>
        self || (self = Object.assign(build, properties) as GroupType);

    const properties: OmitCallSignature<GroupType> = {
        list,
        get map() {
            return map as Prettify<MapProvidersById<Providers>>;
        },
        add,
        concat,
        onStart,
        onStop,
        start,
        stop,
        dispose,
        isolate,
        mock,
    };

    return getSelf();
};

export const group = createGroup;
