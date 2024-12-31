# context-resolver

A type-safe, async-first library for IoC/DI.

## Why you shouldn't use this library

This library was created to scale typed asynchronous codebases that use interfaces and functions rather than classes. Therefore, I do not recommend using this library in projects where:

-   OOP and classes are the main approach;
-   The amount of code is small enough to build the application manually;
-   TypeScript is not used.

For cases that do not fit the purpose of this library, I recommend the following solutions: [Awilix](https://github.com/jeffijoe/awilix), [Nest](https://github.com/nestjs/nest), [TSyringe](https://github.com/microsoft/tsyringe).

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

# Get started

#### Table of contents

-   [Providers](#Providers)
    -   [Standalone providers](#Standalone-providers)
    -   [Dependent providers](#Dependent-providers)
    -   [Resolution](#Resolution)
    -   [Partial resolution](#Partial-resolution)
    -   [Singleton and transient](#Singleton-and-transient)
    -   [Mocking](#Mocking)
    -   [Cloning and isolation](#Cloning-and-isolation)
    -   [Resolution interception](#Resolution-interception)
-   [Selections](#Selections)
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

### Singleton and transient

All providers are singletons by default, meaning they are instantiated only once and returned on every resolution:

```ts
const $singleton = provide("singleton").by(createSingleton);
```

```ts
(await $singleton()) === $singleton();
```

In addition to singletons, providers also gives the ability to change its mode to transitive, which will force a new provider to create a new instance on each resolution. This feature is very often used when it is necessary to have separate state for each resolution.

```ts
const $transient = provide("transient").by(createTransient).transient();
```

```ts
(await $transient()) !== $transient();
```

-   [transient](#transient) is a provider method that creates a new provider with `isTransient` set to `true`, which forces a provider to create new instance on each resolution.

A provider can also be converted back to a singleton:

```ts
const $serviceButSingleton = $service.singleton();
```

-   [singleton](#singleton) is a provider method that creates a new provider with `isTransient` set to `false` which forces the provider to create an instance only once and return it on every resolution.

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

# Reference

#### Table of contents

-   [Functions](#Functions)
-   [Provider](#Provider-Provider)
-   [Selection](#Selection-ProviderSelection)

## Functions

### `createProvider` / `provide`

#### Parameters

-   `id`: Unique identifier.
-   `opts?`: Configuration:
    -   `dependencies?`: A list of dependency providers.
    -   `resolver?`: A function that creates an instance.
    -   `isTransient?`: If `true`, each new resolution will create a new instance, otherwise the instance will be created once and will be returned on each resolution. Default is `false`.

#### Description

Creates a [provider](#Provider-Provider), a structure that creates instances by resolving its dependencies.

#### Examples

```ts
const $service = createProvider("service", {
    dependencies: [$otherService],
    resolver: createService,
    isTransient: true,
});
```

With `provide` and builder methods:

```ts
const $service = provide("service")
    .use($otherService)
    .by(createService)
    .singleton();
```

### `createSelection` / `select`

#### Parameters

-   `...providers`: A list of providers to select.

#### Description

Creates a [provider selection](#Selection-ProviderSelection), a set of providers grouped together into a common context.

## Provider (`Provider`)

Creates instances by resolving its dependencies.

### `()` (callable)

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

### `.isTransient`

If `true`, each new resolution will create a new instance, otherwise the instance will be created once and will be returned on each resolution. Default is `false`.

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

### `.transient`

Creates a new provider with `isTransient` set to `true`, which forces a provider to create new instance on each resolution.

#### Examples

```ts
const $service = provide("service").by(createService).transient();

(await $service()) !== (await $service());
```

### `.singleton`

Creates a new provider with `isTransient` set to `false` which forces the provider to create an instance only once and return it on every resolution. This is the default setting.

#### Examples

```ts
const $service = provide("service").by(createService).singleton();

(await $service()) === (await $service());
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

## Selection (`ProviderSelection`)

Set of providers grouped together into a common context.

### `()` (callable)

Resolves instances of all providers from a list, producing an instance map.

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

# Contribution

This is free and open source project licensed under the [MIT License](LICENSE). You could help its development by contributing via [pull requests](https://github.com/ncor/context-resolver/fork) or [submitting an issue](https://github.com/ncor/context-resolver/issues).
