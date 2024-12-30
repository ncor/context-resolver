# context-resolver

A type-safe, async-first context resolution library for IoC/DI and lifecycle management.

# Installation

### Requirements

-   Typescript 4.1

### From `npm`

```bash
npm add context-resolver    # npm
pnpm add context-resolver   # pnpm
yarn add context-resolver   # yarn
bun add context-resolver    # bun
deno add context-resolver   # deno
```

# Before you start

## Why you shouldn't use this library

This library was created to scale typed asynchronous code bases that use interfaces and functions rather than classes. Therefore, I do not recommend using this library in projects where:

-   OOP and classes are the main approach;
-   The amount of code is small enough to build the application manually;
-   TypeScript is not used.

For cases that do not fit the purpose of this library, I recommend the following solutions: [Awilix](https://github.com/jeffijoe/awilix), [Nest](https://github.com/nestjs/nest), [TSyringe](https://github.com/microsoft/tsyringe).

## Some theory

Let's say you already have constructors or functions that create instances of classes or structures. To maintain encapsulation and low coupling, the created entities do not communicate with each other in the global scope, they are created with their own instances of their dependencies that were passed to the constructor. This approach is called inversion of control, and the mechanism for passing dependencies to the constructor is dependency injection.

Let's look at an example of this approach with classes:

```ts
interface Config {
    connectionUrl: string;
}

interface IDatabaseClient {}

interface Repository<Entity> {}
```

```ts
class DatabaseClient implements IDatabaseClient {
    constructor(dependencies: { connectionUrl: string }) {
        this.connectionUrl = dependencies.connectionUrl;
    }
}

class CookieJar implements Repository<Cookie> {
    constructor(dependencies: { databaseClient: IDatabaseClient }) {
        this.databaseClient = dependencies.databaseClient;
    }
}
```

```ts
const main = () => {
    const config: Config = {
        connectionUrl: "...",
    };

    const databaseClient = new DatabaseClient({
        connectionUrl: config.connectionUrl,
    });

    const cookieJar = new CookieJar({
        databaseClient: databaseClient,
    });
    // Now we have an instance of CookieRepository!
};
```

And with functions:

```ts
interface Config {
    connectionUrl: string;
}

interface DatabaseClient {}

interface Repository<Entity> {}
```

```ts
const createDatabaseClient = (dependencies: {
    connectionUrl: string;
}): DatabaseClient => {};

const createCookieJar = (dependencies: {
    databaseClient: DatabaseClient;
}): CookieJar => {};
```

```ts
const main = () => {
    const config: Config = {
        connectionUrl: "...",
    };

    const databaseClient = createDatabaseClient({
        connectionUrl: config.connectionUrl,
    });

    const cookieJar = createCookieJar({
        databaseClient: databaseClient,
    });
};
```

We encapsulated modules and defined their dependencies using interfaces. We injected dependencies manually, imperatively, creating entity after entity and passing each to the constructor partially or completely. In general, this approach works and works well, but what if we have dozens or even hundreds of modules, and the dependencies between them are many times greater? For such cases we need automation, a tool that will allow us to create instances for us.

# Get started

#### Table of contents

-   [Providers](#Providers)
    -   [Standalone providers](#Standalone-providers)
    -   [Dependent providers](#Dependent-providers)
    -   [Resolution](#Resolution)
    -   [Partial resolution](#Partial-resolution)
    -   [Singletons](#Singletons)
    -   [Caching](#Caching)
    -   [Lifecycle](#Lifecycle)
    -   [Mocking](#Mocking)
    -   [Cloning and isolation](#Cloning-and-isolation)
    -   [Resolution interception](#Resolution-interception)
-   [Selections](#Selections)
    -   Not written yet.
-   [Scopes](#Scopes)
    -   Not written yet.

## Providers

The library's main approach to the problem is the [provider](#Provider-Provider), a structure that creates instances of one type. Each provider has a unique string identifier, a list of dependencies (links to other providers) and a resolver, a function that accepts the resolved dependencies and creates an instance.

### Standalone providers

Let's create a single provider without dependencies using an existing function that creates instances:

```ts
const $logger = provide("logger").by(createLogger);
```

-   The `$` prefix is a stylistic element that indicates that the variable contains an instance provider, [selection](#Selection-ProviderSelection), or [scope](#Scope-ProviderScope).
-   [provide](#createProvider--provide) is a function that creates a provider.
-   [by](#by--withResolver) is a provider method that accepts a constructor function and creates a new provider with it.

### Dependent providers

Let's say we have an entity that needs a logger. For it we can create a provider with dependencies:

```ts
const createCookieService = (dependencies: { logger: Logger }) => {};

const $cookieService = provide("cookieService")
    .use($logger)
    .by(createCookieService);
```

-   [use](#use) is a provider method that accepts a list of other providers as dependencies and creates a new provider with it.

Now this provider will request an instance of the logger entity from the logger provider on each resolution.

<details>
    <summary>What?</summary>
    When we specify dependencies in providers, we modify the type of container passed to the resolver. The resolver always accepts only two arguments - an object with dependencies by their identifier and a lifecycle instance. For example, we passed a logger to the list of dependencies, whose identifier is "logger", which means that an object with a field whose key will be "logger" and whose value will be an instance of the logger type will go to the resolver.
</details>

### Resolution

To get an instance from a provider, you just need to call it. When calling a provider, the provider first calls other providers to get instances of their entities, then collects them into a container and passes them to its resolver, which in turn gives us a promise of an instance.

```ts
const cookieService = await $cookieService();
```

Basically an equivalent of:

```ts
const cookieService = createCookieService({
    logger: createLogger(),
});
```

### Partial resolution

The provider allows you to provide only part of the container so that it resolves the remaining dependencies and creates a new instance:

```ts
const $frame = provide("frame").by(createFrame);
const $wheels = provide("wheels").by(createWheels);
const $car = provide("car").use($frame, $wheels).by(createCar);
```

```ts
const wheelsFromJohn = createWheels();
const car = await $car.complete({
    wheels: wheelsFromJohn,
});
```

-   [complete](#complete) is a provider method that takes a portion of a dependency container and resolves an instance by resolving the remaining dependencies.

### Singletons

Often it is necessary to create only one instance of an entity, which will be passed to all resolutions of entities that depend on it. This pattern is called a singleton, and the library implements it using caching. Let's look at an example of using a special method that turns a provider into a singleton provider:

```ts
const $databaseClient = provide("databaseClient")
    .use($config)
    .by(({ config }) => createDatabaseClient(config.connectionUrl))
    .singleton("main");
```

-   [singleton](#singleton) is a provider method that accepts an optional cache key and creates a new provider with a default cache key of that value or `"_singleton"`.

Now, every time we resolve this provider, we will get back the same instance, unless we specify a custom key that is different from the default:

```ts
(await $databaseClient()) === (await $databaseClient());
(await $databaseClient()) !== (await $databaseClient("different"));
```

### Caching

In the topic about [singletons](#Singletons) we touched on caching, here we will understand how it works and how to use it.

[Resolution cache](#Resolution-cache-ResolutionCache) is an interface to the instance resolution map, which is created [in each provider](#cache).

It can be used when resolving a new instance by passing a cache key to the call. If there is no cached instance under that key, a new instance will be created and cached under that key. If there is already an instance cached under that key, it will be returned and no new instance will be created:

```ts
const $service = provide("service").by(createService);
```

```ts
(await $service()) !== (await $service());
(await $service("key")) === (await $service("key"));
(await $service("key")) !== (await $service("different"));
```

We can specify a default caching key using the [singleton](#singleton) method, which was already used in the topic about [singletons](#Singletons). When a default caching key is set, every new resolve call that does not explicitly specify a caching key will use this default key. If a resolve call is passed a key that differs from the default, this key will be used for caching, ignoring the default:

```ts
const $service = provide("service").by(createService).singleton("key");
```

```ts
(await $service()) === (await $service());
(await $service()) === (await $service("key"));
(await $service()) !== (await $service("different"));
```

To clear the entire cache or remove a single resolution from it we can use [dispose](#dispose) method provided by the cache interface.

```ts
$service.cache.dispose("key"); // removes one under the "key"
```

```ts
$service.cache.dispose(); // removes all
```

For more advanced work with caches, I recommend to read [this part of a reference](#Resolution-cache-ResolutionCache).

### Lifecycle

The provider and their set structures have a [lifecycle](#Lifecycle-event-broker-Lifecycle). It is a broker of start and stop events, which allows publishing these events and subscribing to them. This feature helps to conveniently run the code on startup and termination, for example for example, connecting to and disconnecting from database.

```ts
const $databaseClient = provide("databaseClient")
    .use($config)
    .by(({ config }, lc) => {
        const client = createDatabaseClient(config.connectionUrl);

        lc.onStart(() => client.connect());
        lc.onStop(() => client.disconnect());

        return client;
    })
    .singleton("main");
```

```ts
const databaseClient = await $databaseClient();

await databaseClient.lifecycle.start(); // runs client.connect()
// ...
await databaseClient.lifecycle.stop(); // runs client.disconnect()
```

-   `lc` is an argument with a [provider lifecycle](#lifecycle) instance that is passed to the resolver on each resolution and is needed to hook in the resolution context.
-   [onStart](#onStart) and [onStop](#onStop) are methods that register the start and stop event callbacks respectively. The function passed to these methods will be run immediately after the event is published.
-   [start](#start) and [stop](#stop) are methods that publish a start and stop event, respectively. They return a promise that will be resolved once all registered callbacks have been executed.

We can also subscribe to events outside the resolver.

```ts
databaseClient.lifecycle.onStart(...)
databaseClient.lifecycle.onStop(...)
```

For more advanced work with lifecycles, I recommend to read [this part of a reference](#Lifecycle-event-broker-Lifecycle).

### Mocking

Often, it is necessary to test modules separately in an isolated environment without side effects. In order not to redefine the entire dependency graph to embed a mock provider, for example, instead of a real database, we can replace them with just one line. The provider allows to replace any provider of direct or transitive dependency of its context by a unique identifier and a matching interface:

```ts
const $databaseClient = provide("databaseClient").by(createDatabaseClient);
// ...

export const $userRepository = provide("userRepository").use($databaseClient);

export const $userService = provide("userService").use($userRepository);
```

```ts
import { $userService } from "./main";

const $databaseClientMock = provide("databaseClient").by(
    createDatabaseClientMock,
);

const $userServiceWithMock = $userService.mock($databaseClientMock);

$userServiceWithMock.dependencies[0].dependencies[0] === $databaseClientMock;
```

-   [mock](#mock) is a provider method that takes mock providers whose interfaces exist in the context of the current provider, and replaces all providers that match by unique identifiers with these providers, rebuilding the parts of the branch in which the replacements were made, returning a copy of the current provider.

### Cloning and isolation

There are cases when you need to copy a provider entity to create a new cache and lifecycle scope. There is a method specifically for this that copies a provider, inheriting the same set of characteristics as the original, except for cache and lifecycle. Providers created this way retain references to the original's dependency providers:

```ts
const $service = provide("service").use($otherService).by(createService);
```

```ts
const $serviceReplica = $service.clone();

$serviceReplica !== $service;
$serviceReplica.dependencies[0] === $otherService;
```

-   [clone](#clone) is a provider method that creates a provider with the same properties as an original.

However, there is a much more powerful thing - isolation. It makes a full copy of the provider context, that is, the entire dependency graph that is needed to resolve an instance of this provider, creating a new graph with the same set of relations:

```ts
const $otherService = provide("otherService").by(createOtherService);
const $service = provide("service").use($otherService).by(createService);
```

```ts
const $isolatedService = $service.isolate();

$isolatedService !== $service;
$isolatedService.dependencies[0] !== $otherService;
```

-   [isolate](#isolate) is a provider method that creates a full copy of a provider context and returns a copy of a provider itself.

### Resolution interception

The provider allows you to register functions that will be called whenever a new permission is granted with an instance of that permission:

```ts
$service.onEach((service) =>
    console.log("resolved an instance of Service:", JSON.stringify(service)),
);
```

-   [onEach](#onEach) is a provider method that registers the resolution callback.

Why? In fact, there was only one reason - to hook events outside the resolver.

## Selections

Not written yet.

## Scopes

Not written yet.

# Reference

#### Table of contents

-   [Functions](#Functions)
-   [Provider](#Provider-Provider)
-   [Resolution cache](#Resolution-cache-ResolutionCache)
-   [Lifecycle event broker](#Lifecycle-event-broker-Lifecycle)
-   [Selection](#Selection-ProviderSelection)
-   [Scope](#Scope-ProviderScope)

## Functions

### `createProvider` / `provide`

#### Parameters

-   `id`: Unique identifier.
-   `opts?`: Configuration:
    -   `dependencies?`: A list of dependency providers.
    -   `resolver?`: A function that creates an instance.
    -   `defaultCacheKey?`: A default cache key. When this string is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.

#### Description

Creates a [provider](#Provider-Provider), a structure that creates instances by resolving its dependencies.

#### Examples

```ts
const $service = createProvider("service", {
    dependencies: [$otherService],
    resolver: createService,
    defaultCacheKey: "key",
});
```

With `provide` and builder methods:

```ts
const $service = provide("service")
    .use($otherService)
    .by(createService)
    .singleton("key");
```

### `createSelection` / `select`

#### Parameters

-   `...providers`: A list of providers to select.

#### Description

Creates a [provider selection](#Selection-ProviderSelection), a set of providers grouped together into a common context.

### `createScope` / `scope`

#### Parameters

-   `...providers`: A list of predefined providers.

#### Description

Creates a provider scope, an untyped set of providers for global distribution of lifecycle events and cache disposition.

## Provider (`Provider`)

Creates instances by resolving its dependencies.

### `()` (callable)

#### Parameters

-   `cacheKey`: A key under which the instance will be cached.

#### Description

Resolves an instance by calling its resolver with dependencies.

#### Examples

```ts
const $otherService = provide("otherService").by(createOtherService);
const $service = provide("service").using($otherService).by(createService);

const service = await $service();
```

_Can be seen as_ a shortcut for:

```ts
const service = await createService({
    otherService: await createOtherService(),
});
```

### `.id`

Unique identifier.

### `.dependencies`

A list of dependency providers.

### `.cache`

Stores and provides resolutions. [Learn more](#Resolution-cache-ResolutionCache)

### `.lifecycle`

Start and stop event broker. [Learn more](#Lifecycle-event-broker-Lifecycle)

### `.as`

#### Parameters

-   `id:` Unique identifier.

#### Description

Creates a new provider with a modified unique identifier.

### `.by` / `.withResolver`

#### Parameters

-   `id:` A function that creates an instance.

#### Description

Creates a new provider with a modified resolver.

### `.use`

#### Parameters

-   `...providers:` A list of dependency providers.

#### Description

Creates a new provider with a modified list of dependency providers. A provider created by this method must define a new resolver because this method establishes a new set of provider interfaces.

#### Examples

```ts
const $standaloneService = provide("standaloneService").by(
    createStandaloneService,
);

const $serviceWithDeps = $standaloneService
    .use($otherService)
    .by(createServiceWithDeps);
```

In case a resolver is not specified after, it will return an empty object with an `unknown` type:

```ts
const $serviceWithDeps = $standaloneService.use($otherService);

(await $serviceWithDeps()) === {};
```

### `.singleton`

#### Parameters

-   `key`: Cache key. Defaults to `"singleton"` if not specified.

Creates a new provider with a modified default cache key. When a default cache key is set, a first instance will be stored under that key, and all future resolutions will return that entity unless a different key is intentionally specified.

#### Examples

```ts
const $service = provide("service").by(createService).singleton("key");

(await provider()) === (await provider());
(await provider()) !== (await provider("different"));
```

### `.mock`

#### Parameters

-   `...providers`: A list of mock dependency providers.

#### Description

Creates a new Provider by replacing dependency providers with compatible mocks, traversing an entire provider context graph. A replaced provider is identified by a unique identifier.

#### Examples

```ts
const $first = provide("first").by(createFirst);
const $second = provide("second").use($first).by(createSecond);
const $third = provide("third").use($second).by(createThird);

const $firstMock = provide("first").by(createFakeFirst);
const $thirdWithMockedFirst = $third.mock($firstMock);

$thirdWithMockedFirst.dependencies[0].dependencies[0] !== $first; // $second
```

### `.clone`

Creates a new provider with the same properties as an original.

### `.isolate`

Clones the current provider and its context into an identical transitive graph.

#### Examples

```ts
const $first = provide("first").by(createFirst);
const $second = provide("second").use($first).by(createSecond);

const $isolatedSecond = $second.isolate();

$isolatedSecond !== $second;
$isolatedSecond.dependencies[0] !== $first;
```

### `.onEach`

#### Parameters

-   `callback`: A function that will be called with each resolved instance.

#### Description

Registers a callback that will be called with each resolved instance.

#### Examples

```ts
$broker.onEach((broker) => {
    $broker.lifetime.onStart(() => broker.listen());
    $broker.lifetime.onStop(() => broker.stop());
});
```

### `.complete`

#### Parameters

-   `resolvedPart`: Already resolved part of dependency container.
-   `cacheKey?`: A key under which the instance will be cached.

#### Description

Resolves remaining dependencies based on the container portion already provided.

#### Examples

```ts
const $first = provide("first")
    .by(createFirst)
const $second = provide("second")
    .use($first)
    .by(createSecond)
const $third = provide("third")
    .use($second)
    .by(createThird)

const third = await $third.complete(
    { first: createFirst(...) }
)
```

## Resolution cache (`ResolutionCache`)

Stores and provides resolutions. Created for each [provider](#Provider-Provider).

### `.map`

Cache.

### `.get`

#### Parameters

-   `key`: A key of cached resolution.

#### Description

Retrieves a possibly existing resolution from the cache.

### `.set`

#### Parameters

-   `key`: Akey under which the instance will be saved.
-   `resolution`: A promise of an instance.

#### Description

Saves the resolution in the cache.

### `.all`

Retrieves all existing resolutions from the map.

### `.dispose`

#### Parameters

-   `key?`: A key of cached resolution.

#### Description

Removes all resolutions from the cache. Tries to remove one if key parameter is provided.

## Lifecycle event broker (`Lifecycle`)

Start and stop event broker. Created for each [provider](#Provider-Provider), [selection](#Selection-ProviderSelection) and [scope](#Scope-ProviderScope).

### `.startEventListeners`

A list of start event listeners.

### `.stopEventListeners`

A list of stop event listeners.

### `.onStart`

#### Parameters

-   `listener`: A function that will be called on start event.

#### Description

Registers a listener for each start event.

### `.onStop`

#### Parameters

-   `listener`: A function that will be called on stop event.

#### Description

Registers a listener for each stop event.

### `.start`

Fires a start event, calling all start event listeners.

### `.stop`

Fires a stop event, calling all stop event listeners.

## Selection (`ProviderSelection`)

Set of providers grouped together into a common context.

### `()` (callable)

#### Parameters

-   `cacheKey?`: A key under which all instances will be cached.

#### Description

Resolves instances of all providers from a list, producing an instance map. The passed parameters will be applied for every resolution.

#### Examples

```ts
const $all = select($first, $second, $third)
const all = $all()

all == {
    first: ...,
    second: ...,
    third: ...
}
```

### `.list`

A list of providers.

### `.map`

A map of providers by their unique identifier.

### `.lifecycle`

Start and stop event broker. Each start and stop event will trigger the same event in each provider from the list. [Learn more](#Lifecycle-event-broker-Lifecycle)

### `.onEach`

#### Parameters

-   `callback`: A function that will be called with each resolved instance map.

#### Description

Registers a callback that will be called with each resolved instance map.

#### Examples

```ts
$all.onEach((all) => {
    $second.lifecycle.onStart(() =>
        console.log(all.second, "started with", all.first),
    );
    $third.lifecycle.onStart(() =>
        console.log(all.third, "started with", all.first),
    );
});
```

### `.disposeEachCache`

#### Parameters

-   `key?`: A cached instance key.

Calls `dispose` method of each provider cache in the list. [Learn more](#dispose)

### `.isolate`

#### Description

Clones a known graph into an identical one, returning a selection with the same set of interfaces.

#### Examples

```ts
const $first = provide("first").by(createFirst);
const $second = provide("second").use($first).by(createSecond);
const $third = provide("third").use($first).by(createThird);

const $all = select($first, $second, $third);
const $allIsolated = $all.isolate();

Object.is(
    $allIsolated.map.$second.dependencies[0],
    $allIsolated.map.$third.dependencies[0],
) === true;
// the same thing with just `select($second, $third)`
```

### `.mock`

#### Parameters

-   `...providers`: A list of mock dependency providers.

#### Description

Creates a new selection by replacing dependency providers with compatible mocks, traversing an entire available graph. A replaced provider is identified by a unique identifier.

#### Examples

```ts
const $first = provide("first").by(createFirst);
const $second = provide("second").use($first).by(createSecond);
const $third = provide("third").use($first).by(createThird);

const $firstMock = provide("first").by(createFakeFirst);

const $all = select($first, $second, $third);
const $allWithMockedFirst = $all.mock($firstMock);

$allWithMockedFirst.map.first === $firstMock;
$allWithMockedFirst.map.second.dependencies[0] === $firstMock;
$allWithMockedFirst.map.third.dependencies[0] === $firstMock;
```

## Scope (`ProviderScope`)

Untyped set of providers for global distribution of lifecycle events and cache disposition.

### `.providers`

A list of registered providers.

### `.lifecycle`

Start and stop event broker. Each start and stop event will trigger the same event in each provider in the scope. [Learn more](#Lifecycle-event-broker-Lifecycle)

### `.add`

#### Parameters

-   `...providers`: A list of providers to add.

#### Description

Adds providers to the scope. Returns a provider if there was only one in the a list, otherwise returns a selection of providers in the list.

### `.disposeEachCache`

#### Parameters

-   `key?`: A cached instance key.

#### Description

Calls `dispose` method of each provider cache in the scope. [Learn more](#dispose)

# Contribution

This is free and open source project licensed under the [MIT License](LICENSE). You could help its development by contributing via [pull requests](https://github.com/ncor/context-resolver/fork) or [submitting an issue](https://github.com/ncor/context-resolver/issues).
