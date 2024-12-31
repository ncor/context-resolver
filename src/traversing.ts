import { ProviderShape } from "./provider";

type Unique<T extends readonly any[], Seen = never> = T extends [
    infer First,
    ...infer Rest,
]
    ? First extends Seen
        ? never
        : [First, ...Unique<Rest, Seen | First>]
    : [];

export type InferContext<Dependencies extends ProviderShape[]> =
    Dependencies extends []
        ? Dependencies
        : Unique<
              [
                  ...Dependencies,
                  ...InferContext<Dependencies[number]["dependencies"]>,
              ]
          >;

export const createProviderCloneResolver = (
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

export const createProviderMockResolver = (
    mockMap: Record<string, ProviderShape>,
) => {
    const resolveMock = (provider: ProviderShape) => {
        const mock = mockMap[provider.id];
        if (mock) return mock;

        if (provider.dependencies.length > 0)
            return provider.mock(...provider.dependencies.map(resolveMock));

        return provider;
    };

    return resolveMock;
};
