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

const unique = <T extends any[]>(xs: T) => Array.from(new Set(xs)) as T;

/**
 *  A function that creates an instance.
 */
type Resolver<C extends Record<string, any>, I> = (
    container: C,
) => MaybePromise<I>;

type InferProviderInstance<P extends ProviderShape> =
    P extends Provider<infer I, any, any> ? I : never;

type MapProvidersInstancesById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: InferProviderInstance<P>;
};

type CachingOpts<Instance> = {
    /**
     *  Function called upon instance disposal.
     */
    disposer?: Disposer<Instance>;
    /**
     * Time-to-live in milliseconds.
     */
    ttl?: number;
};

/**
 * Additional caching options for multiple instances.
 */
type UnrelatedCachingOpts = {
    ttl?: number;
};

type Provider<
    Instance,
    Id extends string,
    Dependencies extends ProviderShape[],
> = {
    /**
     * Resolves an instance with dependencies.
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
     * @param cacheKey Optional key for caching.
     * @param cacheOpts Optional caching options.
     */
    (cacheKey?: string, cacheOpts?: CachingOpts<Instance>): Promise<Instance>;
    /**
     * Resolves remaining dependencies based on the container
     * portion already provided. If there is already
     * a cached instance under the key, it will be disposed
     * and replaced with a new one.
     *
     * @param resolvedPart Already resolved part of dependencies.
     * @param cacheKey Optional key for caching.
     * @param cacheOpts Optional caching options.
     */
    complete(
        resolvedPart: Partial<MapProvidersInstancesById<Dependencies>>,
        cacheKey?: string,
        cacheOpts?: CachingOpts<Instance>,
    ): Promise<Instance>;
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
     * Unique identifier of the provider.
     */
    id: Id;
    /**
     * A list of dependency providers.
     */
    dependencies: Dependencies;
    /**
     * Creates a new provider with a new identifier.
     *
     * @param id A unique identifier for the provider.
     */
    as<NewId extends string>(
        id: NewId,
    ): Provider<Instance, NewId, Dependencies>;
    /**
     * Disposes cached instances.
     * ```ts
     * await provider.dispose();
     * // all clean
     * ```
     *
     * Can dispose of an instance by cache key.
     * ```ts
     * await provider.dispose("cacheKey");
     * // one instance is disposed
     * ```
     *
     * @param cacheKey Optional key to dispose an instance by its cache key. Disposes all instances if not provided.
     */
    dispose(cacheKey?: string): Promise<void>;
    /**
     * Creates a new provider with a new resolver.
     *
     * @resolver A function that creates an instance.
     */
    by<NewInstance>(
        resolver: Resolver<
            Prettify<MapProvidersInstancesById<Dependencies>>,
            NewInstance
        >,
    ): Provider<NewInstance, Id, Dependencies>;
    /**
     * Creates a new provider with a specified list of dependencies.
     *
     * @param dependencies A list of dependency providers.
     */
    using<NewDependencies extends ProviderShape[]>(
        ...dependencies: NewDependencies
    ): Provider<Instance, Id, NewDependencies>;
    /**
     * Creates a new provider with a default disposer for all cached instances.
     *
     * @param disposer Function called upon disposition.
     */
    withDisposer(
        disposer?: Disposer<Instance>,
    ): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with a default cache key for all resolutions.
     *
     * @param cacheKey Cache key. Defaults to `"singleton"` if not specified.
     */
    persisted(cacheKey?: string): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with a default time-to-live for all resolutions.
     *
     * @param Time-to-live in milliseconds.
     */
    temporary(ttl: number): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with the same properties as the original.
     */
    clone(): Provider<Instance, Id, Dependencies>;
    /**
     * Returns information for debugging.
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

export const createProvider = <
    Instance,
    Id extends string,
    Dependencies extends ProviderShape[],
>(
    id: Id,
    opts?: {
        /**
         * Array of dependency providers.
         */
        dependencies?: Dependencies;
        /**
         * A function that creates an instance.
         */
        resolver?: Resolver<
            Prettify<MapProvidersInstancesById<Dependencies>>,
            Instance
        >;
        /**
         * Function to dispose of an instance.
         */
        disposer?: Disposer<Instance>;
        /**
         * Default key for caching the instance.
         */
        defaultCacheKey?: string;
        /**
         * Default time-to-live of cached instance.
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

    const instanceCallable = resolve;

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
    };

    return Object.assign(
        instanceCallable,
        instanceWithoutCallable,
    ) as ProviderType;
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

type MapProvidersById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: P;
};

type ProviderGroup<Providers extends ProviderShape[]> = {
    /**
     * Resolves all instances within the group with dependencies into an instance map.
     * ```ts
     * const instanceMap = await group();
     * // instanceMap.someInstance
     * ```
     *
     * Can apply simplified caching to all instances.
     * ```ts
     * const instanceMap = await group("cacheKey", {
     *     ttl: 1000,
     * });
     * ```
     */
    (
        cacheKey?: string,
        cacheOpts?: UnrelatedCachingOpts,
    ): Promise<MapProvidersInstancesById<Providers>>;
    /**
     * Disposes cached instances of all providers in the group.
     *
     * @param cacheKey Optional key to dispose instances by a common cache key.
     * Disposes all instances if not provided.
     */
    dispose(cacheKey?: string): Promise<void>;
    /**
     * A list of grouped providers.
     */
    list: Providers;
    /**
     * A map of provider IDs to their respective providers.
     */
    map: Prettify<MapProvidersById<Providers>>;
    /**
     * Creates a new group by adding providers to the current group.
     *
     * @param providers A list of providers to add.
     */
    add<AddedProviders extends ProviderShape[]>(
        ...providers: AddedProviders
    ): ProviderGroup<[...Providers, ...AddedProviders]>;
    /**
     * Creates a new group by merging another group into the current one.
     *
     * @param group A group to be concatenated.
     */
    concat<OtherProviders extends ProviderShape[]>(
        group: ProviderGroup<OtherProviders>,
    ): ProviderGroup<[...Providers, ...OtherProviders]>;
    /**
     * Creates a new group containing isolated copies of the entire dependency graph.
     * ```ts
     * const requestScope = group.isolate();
     * // Operations on the new group won't affect the original.
     * ```
     */
    isolate(): ProviderGroup<Providers>;
    /**
     * Creates a copy of only one branch, isolating one provider.
     * ```ts
     * const someProvider = group.isolateOne(g => g.someProvider);
     * ```
     *
     * @param selector A function that picks a local provider.
     */
    isolateOne<OneProvider extends Providers[number]>(
        selector: (map: MapProvidersById<Providers>) => OneProvider,
    ): OneProvider;
    /**
     * Creates a new group with isolated copies of specified providers.
     * ```ts
     * const subgroup = group.isolateSome(g => [g.first, g.second]);
     * ```
     *
     * @param selector A function that picks local providers.
     */
    isolateSome<SomeProviders extends Providers[number][]>(
        selector: (map: MapProvidersById<Providers>) => SomeProviders,
    ): ProviderGroup<SomeProviders>;
};

/**
 * Combines a list of providers into a group.
 */
const createGroup = <Providers extends ProviderShape[]>(
    ...providers: Providers
) => {
    type GroupType = ProviderGroup<Providers>;

    const list = unique(providers);

    const map = Object.fromEntries(
        providers.map((p) => [p.id, p]),
    ) as MapProvidersById<Providers>;

    const createCloneResolver = () => {
        const visited = new WeakMap<ProviderShape, ProviderShape>();

        const resolveClone = (provider: ProviderShape) => {
            const alreadyCloned = visited.get(provider);
            if (alreadyCloned) return alreadyCloned;

            let cloned = provider.clone();
            visited.set(provider, cloned);

            if (cloned.dependencies.length > 0)
                cloned = cloned.using(...cloned.dependencies.map(resolveClone));

            return cloned;
        };

        return resolveClone;
    };

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
        const resolveClone = createCloneResolver();

        return createGroup(...(list.map(resolveClone) as Providers));
    };

    const isolateOne: GroupType["isolateOne"] = (selector) => {
        const resolveClone = createCloneResolver();

        return resolveClone(selector(map)) as ReturnType<typeof selector>;
    };

    const isolateSome: GroupType["isolateSome"] = (selector) => {
        const resolveClone = createCloneResolver();
        const selectedProviders = selector(map);

        return group(...selectedProviders.map(resolveClone)) as ProviderGroup<
            ReturnType<typeof selector>
        >;
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
        isolateOne,
        isolateSome,
    };

    return Object.assign(
        instanceCallable,
        instanceWithoutCallable,
    ) as GroupType;
};

export const group = createGroup;
