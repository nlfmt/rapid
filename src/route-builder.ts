import { z, ZodSchema } from "zod"
import { Flatten } from "."

type Awaitable<T> = T | Promise<T>

const _unsetMarker = Symbol('UnsetMarker')
export type UnsetMarker = typeof _unsetMarker

type HandlerResponseTypes =
    | string | number | boolean | null | undefined | Record<string, any> | any[]
    | Response


type ResponseTransformer<T> = T


/**
 * Route defs
 */
type RouteDef<
    Body extends ZodSchema | UnsetMarker,
    Query extends ZodSchema | UnsetMarker,
    Params extends ZodSchema | UnsetMarker,
    Cookies extends ZodSchema | UnsetMarker,
    Response extends ZodSchema | UnsetMarker,
    Context extends Record<string, any>
> = {
    body: Body
    query: Query
    params: Params
    cookies: Cookies
    response: Response
}
type AnyRouteDef = RouteDef<any, any, any, any, any, Record<string, any>>
type InitialRouteDef = RouteDef<UnsetMarker, UnsetMarker, UnsetMarker, UnsetMarker, UnsetMarker, Record<string, never>>

type MergeDefs<A extends AnyRouteDef, B extends Partial<AnyRouteDef>> = Flatten<{
    [K in keyof A]: K extends keyof B ? B[K] : A[K]
}>

/**
 * Rapid interfaces
 */
interface Rapid<Def extends AnyRouteDef> {
    path(path: string): RapidBuilder<Def>
}

type Handler<Def extends AnyRouteDef, R extends Awaitable<HandlerResponseTypes>> = (c: Context<Def>) => R
type AnyHandler = Handler<AnyRouteDef, Awaitable<HandlerResponseTypes>>

type RegisterHandler<Def extends AnyRouteDef> =
    <R extends Awaitable<HandlerResponseTypes>>(
        handler: (c: Context<Def>) => R
    ) => Rapid<MergeDefs<Def, { response: ResponseTransformer<Awaited<R>> }>>


interface Context<Def extends AnyRouteDef> {
    body: Def['body'] extends ZodSchema ? z.infer<Def["body"]> : any
    query: Def['query'] extends ZodSchema ? z.infer<Def['query']> : any
    params: Def['params'] extends ZodSchema ? z.infer<Def['params']> : any
    cookies: Def['cookies'] extends ZodSchema ? z.infer<Def['cookies']> : any
}

type HTTPMethod = "all" | "get" | "post" | "put" | "delete" | "patch" | "options" | "head"

interface RapidBuilder<Def extends AnyRouteDef> {
    validate<D extends Partial<AnyRouteDef>>(schema: D): RapidBuilder<MergeDefs<Def, D>>
    body<S extends ZodSchema>(schema: S): RapidBuilder<MergeDefs<Def, { body: S }>>
    query<S extends ZodSchema>(schema: S): RapidBuilder<MergeDefs<Def, { query: S }>>
    params<S extends ZodSchema>(schema: S): RapidBuilder<MergeDefs<Def, { params: S }>>
    cookies<S extends ZodSchema>(schema: S): RapidBuilder<MergeDefs<Def, { cookies: S }>>

    all: RegisterHandler<Def>
    get: RegisterHandler<Def>
    post: RegisterHandler<Def>
    put: RegisterHandler<Def>
    delete: RegisterHandler<Def>
    patch: RegisterHandler<Def>
    options: RegisterHandler<Def>
    head: RegisterHandler<Def>
}


class RapidImpl implements Rapid<AnyRouteDef>, RapidBuilder<AnyRouteDef> {
    private schema: { [K in keyof AnyRouteDef]: ZodSchema | null } = {
        body: null,
        query: null,
        params: null,
        cookies: null,
        response: null,
    }
    private _path = ""

    path(path: string) {
        this._path = path
        return this
    }

    validate(schema: Partial<AnyRouteDef>) {
        this.schema = { ...this.schema, ...schema }
        return this
    }

    body(schema: ZodSchema) {
        this.schema.body = schema
        return this
    }
    query(schema: ZodSchema) {
        this.schema.query = schema
        return this
    }
    params(schema: ZodSchema) {
        this.schema.params = schema
        return this
    }
    cookies(schema: ZodSchema) {
        this.schema.cookies = schema
        return this
    }

    all(handler: AnyHandler) {
        return this._handler("all", handler)
    }
    get(handler: AnyHandler) {
        return this._handler("get", handler)
    }
    post(handler: AnyHandler) {
        return this._handler("post", handler)
    }
    put(handler: AnyHandler) {
        return this._handler("put", handler)
    }
    delete(handler: AnyHandler) {
        return this._handler("delete", handler)
    }
    patch(handler: AnyHandler) {
        return this._handler("patch", handler)
    }
    options(handler: AnyHandler) {
        return this._handler("options", handler)
    }
    head(handler: AnyHandler) {
        return this._handler("head", handler)
    }

    private _handler(method: HTTPMethod, handler: AnyHandler) {
        return this
    }
}

export const Rapid = RapidImpl as unknown as { new(): Rapid<InitialRouteDef> }
