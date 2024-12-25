## context-resolver

A type-safe, async-first context resolution library for IoC/DI and lifecycle management.

#### Dependency injection
```ts
const $config = provide("config").by(loadConfig)
const $db = provide("db")
    .using($config)
    .by(({ config }) => connectToDb(config.dbUrl))
    .persisted()
    .withDisposer((db) => db.disconnect())

const db = $db()
```
#### Caching
```ts
const cachedUser = $user(ctx.user.id, {
    ttl: 5_000
})
```
#### Reusability
```ts
const providesRepository = provide("repository")
    .using($db)

const $userRepository = providesRepository
    .as("userRepository")
    .by(createUserRepository)
```
#### Isolation (scopes)
```ts
const $services = group(
    userService,
    authService,
    imageService,
    messageService
)

app.use(async (ctx, next) => {
    const $requestScope = $services.isolate()
    
    const services = $requestScope()
    ctx.set("services", services)

    await next()
})
```
#### Mocking (testing)
```ts
const { reviewService } = group($db, $reviewService)
    .mock($memoryDb)()
```

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

# Basic usage

```ts
// ...
import { provide, group } from "context-resolver"

const $config = provide("config").by(loadConfig)

const $databaseClient = provide("databaseClient")
    .using($config)
    .by(({ config }) =>
           connectToDatabase(config.databaseUrl)
    )
    .persisted()
    .withDisposer(client => client.disconnect())

const providesRepository = provide("repository")
    .using($databaseClient)
const $userRepository = providesRepository
    .as("userRepository")
    .by(createUserRepository)
const $sessionRepository = providesRepository
    .as("sessionRepository")
    .by(createSessionRepository)
const $messageRepository = providesRepository
    .as("messageRepository")
    .by(createMessageRepository)
const $roomRepository = providesRepository
    .as("roomRepository")
    .by(createRoomRepository)

const $authService = provide("authService")
    .using($userRepository, $sessionRepository)
    .by(createAuthService)
const $chatService = provide("chatService")
    .using(
        $authService,
        $messageRepository,
        $roomRepository
    )
    .by(createChatService)

const $authController = provide("authController")
    .using($authService)
    .by(createAuthController)
const $chatController = provide("chatController")
    .using($chatService)
    .by(createAuthController)

const $controllers = group(
    $authController,
    $chatController
)
const {
    authController,
    chatController
} = $controllers()

app.post("/login", authController.login);
app.post("/register", authController.register);

app.get("/rooms", chatController.getAllRooms);
app.post("/room/join", chatController.joinRoom);
app.get("/room/:id/messages", chatController.getRoomMessages);
app.post("/room/:id/send", chatController.sendMessage)
```

# Reference

### Table of contents
- [Provider](#provider)
    - [createProvider (provide)](#createprovider-provide)
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
    - [persisted](#persisted)
    - [temporary](#temporary)
    - [inspect](#inspect)
    - [mock](#mock)
    - [mockByIds](#mockByIds)
    - [mockByReference](#mockByReference)
- [Provider group](#provider-group)
    - [createGroup (group)](#creategroup-group)
    - [list](#list)
    - [map (getter)](#map-getter)
    - [dispose](#dispose-1)
    - [resolve](#resolve-object-call-1)
    - [isolate](#isolate)
    - [isolateOne](#isolateone)
    - [isolateSome](#isolatesome)
    - [add](#add)
    - [concat](#concat)
    - [mock](#mock-1)
    - [mockByIds](#mockByIds-1)


## Provider

A provider is a structure that creates instances by resolving its dependencies, with caching and lifecycle management capabilities.

### `createProvider` (`provide`)

Creates a provider builder.

- `id`: Unique identifier for the provider.
- `opts`: Optional configuration object:
    - `dependencies`: A list of dependency providers.
    - `resolver`: An asynchronous function that creates an instance.
    - `disposer`: A function to dispose of an instance.
    - `defaultCacheKey`: Default key for caching the instance.
    - `defaultCacheTTL`: Default time-to-live for all resolutions.
```ts
const provider = createProvider("someService", {
    dependencies: [otherProvider],
    resolver: createSomeService,
    disposer: handleSomeServiceDisposition,
    defaultCacheKey: "main",
    defaultCacheTTL: 5_000
});
```

```ts
const provider = provide("someService")
    .using(otherProvider)
    .by(createSomeService)
    .withDisposer(handleSomeServiceDisposition)
    .persisted("main")
    .temporary(5_000)
```

### `.id`

Unique identifier of the provider.

### `.dependencies`

A list of dependency providers.

### resolve (object call)

Resolves an instance by calling its resolver with dependencies.

- `cacheKey`: Optional key for caching.
- `cacheOpts`: Optional caching options:
    - `disposer`: Function called upon disposal.
    - `ttl`: Cache time-to-live (milliseconds).

```ts
provider("unique", {
    disposer: handleDisposition,
    ttl: 5_000
});
```

### `.complete`

Resolves remaining dependencies based on the container portion already provided. If there is alreadya cached instance under the key, it will be disposed and replaced with a new one.
- `cacheKey`: Optional key for caching.
- `cacheOpts`: Optional caching options:
    - `disposer`: Function called upon disposal.
    - `ttl`: Cache time-to-live (milliseconds).

### `.mount`

Caches an already existing instance under the specified key. If there is already a cached instance under the key, it will be disposed and replaced with a new one.
- `instance`: An instance to cache.
- `cacheKey`: Optional key for caching.
- `cacheOpts`: Optional caching options:
    - `disposer`: Function called upon disposal.
    - `ttl`: Cache time-to-live (milliseconds).

### `.dispose`

Disposes cached instances.

- `cacheKey`: Optional key to dispose of a specific instance. Disposes all instances if not provided.

### `.clone`

Creates a new provider with the same properties as the original.

### `.as`

Creates a new provider with a new identifier.
- `id`: A unique identifier for the provider.

### `.by`

Creates a new provider with a new resolver.
- `resolver`: A function that creates an instance.

### `.using`

Creates a new provider with a specified list of dependencies.
- `dependencies`: A list of dependency providers.

### `.withDisposer`

Creates a new provider with a default disposer for all cached instances.
- `disposer`: A function called upon disposition.

### `.persisted`

Creates a new provider with a default cache key for all resolutions.
- `cacheKey`: The cache key, defaults to `"singleton"` if not specified.

### `.temporary`

Creates a new provider with a default time-to-live for all resolutions.
- `ttl`: Time-to-live in milliseconds.

### `.inspect`

Returns debugging information.

### `.mock`

Creates a new provider with existing dependency providers replaced by mock providers. Replacement is determined by unique identifiers.
- `providers`: A list of mock dependency providers.

### `.mockByIds`
Creates a new provider with existing dependency providers replaced by mock providers. Replacement is determined by unique identifiers.
- `map`: A map of mock dependency providers by their ids.

### `.mockByReference`
Creates a new provider with existing dependency provider replaced by a mock provider. Replacement is determined by an instance of existing dependency provider.
- `providerInstance`: An instance of existing dependency provider.
- `mockProvider`: A mock provider for the specified one.

## Provider Group

Combines providers into a group for data representation, transformations, and dependency graph isolation.

### `createGroup` (`group`)

Combines a list of providers into a group.
- `providers`: List of providers to group.

### `.list`

A list of grouped providers.

### `.map` (getter)

A map of provider IDs to their respective providers.

### resolve (object call)

Resolves all instances within the group with dependencies, producing an instance map. Supports simplified caching for all instances.

- `cacheKey`: Optional key for caching group instances.
- `cacheOpts`: Optional caching options:
    - `ttl`: Cache time-to-live (milliseconds).

```ts
const instanceMap = await group("cacheKey", {
    ttl: 1000,
});
```

### `.dispose`

Disposes cached instances of all providers in the group.
- `cacheKey`: Optional key to dispose instances by a common cache key. Disposes all instances if not provided.

### `.isolate`

Creates a new group containing isolated copies of the entire dependency graph.

```ts
const requestScope = group.isolate();
// Operations on the new group won't affect the original.
```

### `.isolateOne`

Creates a copy of only one branch, isolating one provider.
- `selector`: A function that picks a local provider.

```ts
const someProvider = group.isolateOne(g => g.someProvider);
```

### `.isolateSome`

Creates a new group with isolated copies of specified providers.
- `selector`: A function that picks local providers.

```ts
const subgroup = group.isolateSome(g => [g.first, g.second]);
```

### `.add`

Creates a new group by adding providers to the current group.
- `providers`: A list of providers to add.

### `.concat`

Creates a new group by merging another group into the current one.
- `group`: A group to be concatenated.

### `.mock`

Replaces existing providers in the available graph with their mock versions and returns a new group of the same type.
- `providers`: A list of mock dependency providers.

### `.mockByIds`

Replaces existing providers in the available graph with their mock versions and returns a new group of the same type.
- `map`: A map of mock dependency providers by their ids.

# Contribution

This is free and open source project licensed under the [MIT License](LICENSE). You could help its development by contributing via [pull requests](https://github.com/ncor/context-resolver/fork) or [submitting an issue](https://github.com/ncor/context-resolver/issues).
