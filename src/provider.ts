import { select } from "./selection";
import {
    createProviderCloneResolver,
    createProviderMockResolver,
    type InferContext,
} from "./traversing";
import {
    type Prettify,
    type InferCallSignature,
    type MaybePromise,
    type SomeOf,
    type OmitCallSignature,
    unique,
} from "./helpers";

type IsTuple<T> = T extends [infer _, ...infer Rest]
    ? Rest["length"] extends number
        ? true
        : false
    : false;

type Resolver<C extends Record<string, any>, I> = (
    container: C,
) => MaybePromise<I>;

type InferProviderInstance<P extends ProviderShape> =
    P extends Provider<infer I, any, any> ? I : never;

export type MapProvidersOutputsById<T extends ProviderShape[]> = {
    [P in T[number] as P["id"]]: InferProviderInstance<P>;
};

type InstanceCallback<Instance> = (instance: Instance) => any;

/**
 * Creates instances by resolving its dependencies.
 */
export type Provider<
    Instance,
    Id extends string,
    Dependencies extends ProviderShape[],
> = {
    /**
     * Resolves an instance by calling its resolver with dependencies.
     */
    (): Promise<Instance>;
    /**
     * Unique identifier.
     */
    id: Id;
    /**
     * A list of dependency providers.
     */
    dependencies: Dependencies;
    /**
     * If `true`, each new resolution will create a new instance,
     * otherwise the instance will be created once and will be
     * returned on each resolution. Default is `false`.
     */
    isTransient: boolean;
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
            NewInstance
        >,
    ): Provider<NewInstance, Id, Dependencies>;
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
     * Creates a new provider with `isTransient` set to `true`,
     * which forces a provider to create new instance on each resolution.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .transient()
     *
     * await $service() !== await $service()
     * ```
     */
    transient(): Provider<Instance, Id, Dependencies>;
    /**
     * Creates a new provider with `isTransient` set to `false`,
     * which forces the provider to create an instance only once and
     * return it on every resolution. This is the default setting.
     * ```ts
     * const $service = provide("service")
     *     .by(createService)
     *     .transient()
     *
     * await $service() === await $service()
     * ```
     */
    singleton(): Provider<Instance, Id, Dependencies>;
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
     */
    complete(
        resolvedPart: Partial<MapProvidersOutputsById<Dependencies>>,
    ): Promise<Instance>;
};

export type ProviderShape = Provider<any, string, any[]>;

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
            Instance
        >;
        /**
         * If `true`, each new resolution will create a new instance,
         * otherwise the instance will be created once and will be
         * returned on each resolution. Default is `false`.
         */
        isTransient?: boolean;
    },
): Provider<Instance, Id, Dependencies> => {
    type ProviderType = Provider<Instance, Id, Dependencies>;

    const resolver = opts?.resolver
        ? opts.resolver!
        : makePhonyResolver<Instance>();

    const dependencies = (
        opts?.dependencies ? unique(opts.dependencies) : []
    ) as Dependencies;
    const container = select(...dependencies);

    const instanceCallbacks: InstanceCallback<Instance>[] = [];

    const isTransient = !!opts?.isTransient;

    let resolvedInstance: Instance | undefined;

    const resolve: InferCallSignature<ProviderType> = async () => {
        if (resolvedInstance && !isTransient) return resolvedInstance;

        resolvedInstance = await resolver(await container());

        instanceCallbacks.forEach((callback) => callback(resolvedInstance!));

        return resolvedInstance;
    };

    const onEach: ProviderType["onEach"] = (callback) => {
        instanceCallbacks.push(callback);

        return getSelf();
    };

    const complete: ProviderType["complete"] = async (resolvedPart) => {
        const resolvedDepedencyIds = Object.keys(resolvedPart);
        const missingDependencies = dependencies.filter(
            (p) => !resolvedDepedencyIds.includes(p.id),
        );
        const missingPart = await select(...missingDependencies)();
        const resolution = await resolver({
            ...resolvedPart,
            ...missingPart,
        });

        return resolution;
    };

    const optsToSave = {
        isTransient,
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

    const transient: ProviderType["transient"] = () =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            isTransient: true,
        });

    const singleton: ProviderType["transient"] = () =>
        createProvider(id, {
            ...optsToSave,
            dependencies,
            resolver,
            isTransient: false,
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
        isTransient,

        as,
        by,
        use,
        transient,
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
