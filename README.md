## context-resolver

A type-safe, async-first context resolution library for IoC/DI and lifecycle management.

### Features
- **Thin.** The library can be seen as a wrapper over simple functional composition with memoization.
- **Relational.** There are no tables by default, instances are resolved by calling their dependency providers.
- **Complete type-safety.** All functions and generated structures are fully typed, which helps in supporting large graphs with many dependencies and identifiers.
- **Constructors are async functions.** Resolvers, or constructors, are asynchronous functions by default, which allows you to provide any value using any method.
- **Caching and lifecycle management.** Entities can be cached for future access (either permanently or temporary) and disposed with a custom function call.
- **Grouping and isolation.** Multiple providers can be grouped into a convenient structure that can be exchanged. It also allows isolating the entire graph or its individual branches into a set of new entities, which is useful for scoping.

### What it doesn't support
- **Service discovery.** All providers are defined and linked explicitly.
- **Decorators.** At the moment it does not support decorators and other in-place injection methods.

# Installation

### Requirements
- Typescript 4.1

### From `npm`
```bash
npm add context-resolver    # npm
pnpm add context-resolver   # pnpm
yarn add context-resolver   # yarn
bun add context-resolver    # bun
deno add context-resolver   # deno
```

# Examples

## Basic usage

```ts
// Creates a provider with the id "logger"
const $logger = provide("logger")
    // Sets a resolver to the `createLogger` function
    .by(createLogger)

const $userService = provide("userService")
    // Binds the `$logger` provider as a depedency
    .using($logger)
    // Accessing logger instance via container by its provider id
    .by(({ logger }) =>
        userService({ logger: logger.prefix("userService") })
    )
```

To resolve an instance, simply call a provider.
```ts
const userService = $userService()

userService.createUser(...)
// Logs { type: "TRACE", action: "USER_CREATED", ... }
```

## Caching

### Default options

```ts
const $env = provide("env").by(getEnv)
const $databaseClient = provide("databaseClient")
    .using($env)
    .by(({ env }) => connectToDatabase(env.databaseUrl))
    /**
     * Sets a default cache key,
     * forcing all resolutions to implicitly use it.
     */
    .once("globalConnection")
    /**
     * Sets a default disposer,
     * forcing all resolutions to implicitly use it.
     */
    .withDisposer(client => client.disconnect())
    /**
     * Sets a default cached instance lifetime,
     * forcing all resolutions to implicitly use it.
     */
    .temporary(60_000)

/**
 * Now all resolutions will lead to the same instance
 * and will be stored in cache for a minute.
 */
await $databaseConnection() === await $databaseConnection()
```

### Retrieval

To resolve a cached instance, either by saving it or by retrieving an existing one, you only need to specify the key as the first argument. You can also specify custom caching options. If the default key or options were specified in the providers, they will be used, if none are specified. If either the key or any of the options were not specified explicitly, the default values from the provider will be used, if any were specified.
```ts
await $databaseConnection("customKey", {
    /**
     * Custom caching options (optional):
     */
    disposer: ...,
    ttl: ...
})
```

### Disposition

To clear the cache, you can call the dispose method, which will also call instance disposers, if any were specified. In our case, we already have the default disposer set, so the client will be disconnected.
```ts
await $databaseConnection.dispose()

/**
 * You also can dispose specific cached instance
 * by its cache key.
 */
await $databaseConnection.dispose("key")
```

### Cloning and isolation

We can clone a provider by creating an identical version of it and keeping references to its dependency providers.
```ts
const $clonedFirst = $first.clone()

$clonedFirst !== $first
$clonedFirst.dependencies[n] == $first.dependencies[n]
```

But if we need to completely isolate the provider from the main graph, we can use the corresponding method. It clones the entire context needed to resolve the instance and creates a new graph with references to identical interfaces.
```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .using($first)
    .by(createSecond)

const $isolatedSecond = $second.isolate()

$isolatedSecond !== $second
$isolatedSecond.dependencies[0].id !== $first
```

### Mocking

When testing, sometimes it is necessary to replace the module context with another one in order to test it without side effects. For this, you can use a special method that replaces dependency providers by a unique identifier with others with an identical interface. The replacement occurs not only in the list of direct dependencies, but also in the entire context.
```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
     .using($first)
    .by(createSecond)
const $third = provide("third")
    .using($first)
    .by(createThird)

const $all = group($first, $second, $third)
const $allWithMockedFirst = $all.mock(
    provide("first").by(createFakeFirst)
)
const $mockedFirst = $allWithMockedFirst.map.first

$mockedFirst !== $first
$allWithMockedFirst.map.second.dependencies[0] === $mockedFirst
$allWithMockedFirst.map.third.dependencies[0] === $mockedFirst
```

## Groups

### Construction and representation

A set of providers can be grouped into a special structure that provides operations on the context of this set.
```ts
const $all = group($first, $second, $third)
```

We can add new providers to groups and concatenate other groups.
```ts
group
    .add($fourth)
    .add($fifth, $sixth)
    .concat(group($seventh, $eighth))
```

And access a list and map of a set.
```ts
group.list === [$first, $second, ...]
group.map === {
    first: ...,
    second: ...,
    ...
}            
```

### Bulk methods

The group has almost identical API for resolution, disposition, isolation and mocking. The difference is that these operations apply to all providers in a common context, and we cannot pass custom disposers, since a different set of interfaces is possible.

#### Resolution
```ts
await group("key", {
    ttl: ...
})
```

#### Disposition
```ts
await group.dispose("key")
```

#### Isolation
Returns a new group.
```ts
// Returns a new group.
await group.isolate()
```

#### Mocking
Returns a new group.
```ts
await group.mock(...)
```

# Reference

### Table of contents
- [Provider](#provider)
    - [createProvider](#createprovider-provide)
    - [id](#id)
    - [dependencies](#dependencies)
    - [resolve](#resolve-object-call)
    - [complete](#complete)
    - [mount](#mount)
    - [dispose](#dispose)
    - [clone](#clone)
    - [as](#as)
    - [by](#by)
    - [using](#using)
    - [withDisposer](#withdisposer)
    - [once](#once)
    - [temporary](#temporary)
    - [inspect](#inspect)
    - [mock](#mock)
    - [isolate](#isolate)
- [Provider group](#provider-group)
    - [createGroup](#creategroup-group)
    - [list](#list)
    - [map](#map-getter)
    - [dispose](#dispose-1)
    - [resolve](#resolve-object-call-1)
    - [isolate](#isolate-1)
    - [add](#add)
    - [concat](#concat)
    - [mock](#mock-1)


## Provider

A provider is a structure that creates and stores instances by resolving its dependencies.

### `createProvider` (aka `provide`)

Creates a provider.
- `id`: Unique identifier.
- `opts?`: Configuration:
    - `dependencies?`: A list of dependency providers.
    - `resolver?`: A function that creates an instance.
    - `disposer?`: When this function is set, all instances will be cached with that disposer unless a different lifetime is intentionally set.
    - `defaultCacheKey?`: When this string is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.
    - `defaultCacheTTL?`: When this number is set, all instances will be cached with that lifetime unless a different lifetime is intentionally set.
```ts
const $service = createProvider("service", {
    dependencies: [$otherService],
    resolver: createService,
    disposer: handleServiceDisposition,
    defaultCacheKey: "key",
    defaultCacheTTL: 1_000
})
```

```ts
const $service = provide("service")
    .using($otherService)
    .by(createService)
    .withDisposer(handleServiceDisposition)
    .once("main")
    .temporary(1_000)
```

### resolve (object call)

Resolves an instance by calling its resolver with dependencies.

- `cacheKey?`: A key for caching.
- `cacheOpts?`: Caching options:
    - `disposer?`: A custom disposer.
    - `ttl?`: An instance lifetime in milliseconds.

```ts
const service = await $service("key", {
    disposer: handleServiceDisposition,
    ttl: 5_000
})
```

### `.id` (property)

Unique identifier.

### `.dependencies` (property)

A list of dependency providers.

### `.as` (builder)

Creates a new provider with a modified unique identifier.
- `id`: Unique identifier.

### `.by` (builder)

Creates a new provider with a modified resolver.
- `resolver`: A function that creates an instance.

### `.using` (builder)

Creates a new provider with a modified list of dependencies. The provider created by this method must define a new resolver because the set of dependency interfaces changes.
- `dependencies`: A list of dependency providers.

### `.withDisposer` (builder)

Creates a new provider with a modified disposer.
- `disposer`: A function that is called when an instance is disposed.

### `.once` (builder)

Creates a new provider with a modified default cache key. When a default cache key is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.
- `cacheKey`: The cache key, defaults to `"singleton"` if not specified.

```ts
const $service = provide("service")
    .by(createService)
    .once("key")

await provider() === await provider()
await provider() !== await provider("different")
```

### `.temporary` (builder)

Creates a new provider with a modified default cached instance lifetime. When the cached instance lifetime is set to default, all instances will be cached with that lifetime unless a different lifetime is intentionally set.
- `ttl`: An instance lifetime in milliseconds.

```ts
const $service = provide("service")
    .by(createService)
    .temporary(1_000)

await provider("key1") // cached for 1 second
await provider("key2", { ttl: 2_000 }) // cached for 2 seconds
```

### `.dispose`

Removes all instances from the cache, calling their disposers. Will attempt to dispose only one entity if a cache key was specified.
- `cacheKey?`: A cache key of a specific instance.

### `.mock`

Creates a new provider by replacing dependency providers with compatible mocks, traversing an entire provider context graph. A replaced provider is identified by a unique identifier.
- `providers`: A list of mock dependency providers.
```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .using($first)
    .by(createSecond)
const $third = provide("third")
    .using($second)
    .by(createThird)

const $thirdWithMockedFirst = $third
    .mock(provide("first").by(createFakeFirst))
```

### `.mount`

Caches an already existing instance under the specified key. If there is already a cached instance under the key, it will be disposed and replaced with a new one.
- `instance`: An instance to cache.
- `cacheKey`: A key under which the instance will be cached.
- `cacheOpts?`: Caching options:
    - `disposer?`: A custom disposer.
    - `ttl?`: An instance lifetime in milliseconds.

### `.complete`

Resolves remaining dependencies based on the container portion already provided. If there is already a cached instance under the key, it will be disposed and replaced with a new one.
- `resolvedPart`: Already resolved part of dependency container.
- `cacheKey?`: A key for caching.
- `cacheOpts?`: Caching options:
    - `disposer?`: A custom disposer.
    - `ttl?`: An instance lifetime in milliseconds.

```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .by(createSecond)
const $third = provide("third")
    .using($first, $second)
    .by(createThird)

const third = await $service.complete(
    { first: createFirst(...) }
)
```

### `.clone`

Creates a new provider with the same properties as an original.

### `.isolate`

Clones the current provider and its context into an identical transitive graph.
```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .using($first)
    .by(createSecond)

const $isolatedSecond = $second.isolate()

$isolatedSecond !== $second
$isolatedSecond.dependencies[0].id !== $first
```

### `.inspect`

Returns debugging information.

## Provider Group

A provider group is set of providers grouped together into a common context.

### `createGroup` (aka `group`)

Creates a provider group.
- `providers`: A list of providers to group.

```ts
const $all = createGroup($first, $second)
```
```ts
const $all = group($first, $second)
```

### `.list` (property)

A list of providers.

### `.map` (getter)

A map of providers.

```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .by(createSecond)

const $allMap = group($first, $second).map

$allMap.first.id === "first"
$allMap.second.id === "second"
```

### resolve (object call)

Resolves instances of all providers from a list, producing an instance map. Supports simplified caching for all instances.
- `cacheKey?`: A key under which all instances will be cached.
- `cacheOpts?`: Caching options:
    - `ttl?`: An instance lifetime in milliseconds.

```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .by(createSecond)

const all = group($first, $second)()

all === {
    first: ..., // instance of the first
    second: ... // instance of the second
}
```

### `.add` (builder)

Creates a new group with a modified list of providers, to which new ones have been added.
- `providers`: A list of providers to add.

### `.concat` (builder)

Creates a new group with a modified list of providers, to which providers from another group were added.
- `group`: A group to be concatenated.

### `.dispose`

Call dispose on all providers from a list.
- `cacheKey?`: A cache key that will be used in all dispositions.

### `.isolate`

Clones a known graph into an identical one, returning a group with the same set of interfaces.

```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .using($first)
    .by(createSecond)
const $third = provide("third")
    .using($first)
    .by(createThird)

const $allIsolated = group($first, $second, $third).isolate()

Object.is(
    $allIsolated.$second.dependencies[0],
    $allIsolated.$third.dependencies[0]
) === true
// the same thing with just `group($second, $third)`
```

### `.mock`

Creates a new group by replacing dependency providers with compatible mocks, traversing an entire available graph. A replaced provider is identified by a unique identifier.
- `providers`: A list of mock dependency providers.

```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
     .using($first)
    .by(createSecond)
const $third = provide("third")
    .using($first)
    .by(createThird)

const $all = group($first, $second, $third)
const $allWithMockedFirst = $all.mock(
    provide("first").by(createFakeFirst)
)
const $mockedFirst = $allWithMockedFirst.map.first

$mockedFirst !== $first
$allWithMockedFirst.map.second.dependencies[0] === $mockedFirst
$allWithMockedFirst.map.third.dependencies[0] === $mockedFirst
```

# Contribution

This is free and open source project licensed under the [MIT License](LICENSE). You could help its development by contributing via [pull requests](https://github.com/ncor/context-resolver/fork) or [submitting an issue](https://github.com/ncor/context-resolver/issues).
