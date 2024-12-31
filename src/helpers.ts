export type MaybePromise<T> = T | Promise<T>;
export type InferCallSignature<T> = T extends { (...args: infer A): infer R }
    ? (...args: A) => R
    : never;
export type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
export type OmitCallSignature<T> = {
    [K in keyof T as K extends string ? K : never]: T[K];
};
export type SomeOf<T extends any[]> = T[number][];

export const unique = <T extends any[]>(xs: T) => Array.from(new Set(xs)) as T;
