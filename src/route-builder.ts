import { Schema, validate, Infer } from "@typeschema/main"
import { Flatten, sendError, RapidError } from "."
import express from "express"


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
type ValidationDef<
    Path extends string,
    Body extends Schema | UnsetMarker,
    Query extends Schema | UnsetMarker,
    Cookies extends Schema | UnsetMarker,
    Params extends UrlParamSchema<Path>,
> = {
    body: Body
    query: Query
    params: Params
    cookies: Cookies
}
type AnyValidationDef = ValidationDef<string, any, any, any, Record<string, Schema>>
type InitialValidationDef<Path extends string> = ValidationDef<Path, UnsetMarker, UnsetMarker, UnsetMarker, UrlParamSchema<Path>>


// this type should be usable like this:
// type MergedMeta = MergeMeta<[M1, M2, M3, M4]>
type MergeMeta<T> = T extends [infer Head, ...infer Tail]
  ? Head extends Record<string, any>
    ? MergeMeta<Tail> & Head
    : MergeMeta<Tail>
  : {}


interface RouteDef<
    Path extends string,
    Body extends Schema,
    Query extends Schema,
    Params extends UrlParamSchema<Path>,
    Cookies extends Schema,
    Output extends Awaitable<HandlerResponseTypes>
> extends Partial<ValidationDef<Path, Body, Query, Cookies, Params>> {
    path: Path
    output: ResponseTransformer<Output>
}
type AnyRouteDef = RouteDef<string, Schema, Schema, Schema, Schema, Awaitable<HandlerResponseTypes>>


type CheckMiddlewareReturnType<Meta extends Record<string, any>, NewMeta> =
  NewMeta extends Record<string, any> ? {
    [K in keyof NewMeta]:
      K extends keyof Context<string, AnyValidationDef>
        ? `Middleware data can't contain key <${K}>, since it is a key of the base context`
      : K extends keyof Meta
        ? K extends string ? `Middleware data can't contain key <${K}>, since it's been specified by another middleware` : `Middleware data contains a key that's been specified by another middleware`
        : NewMeta[K]
  } : NewMeta


type Middleware<
  Path extends string,
  Validation extends Partial<AnyValidationDef>,
  Meta extends Record<string, any>,
  AddedMeta
> = (
  c: Flatten<Context<Path, Validation> & Meta>
) => Awaitable<CheckMiddlewareReturnType<Meta, AddedMeta>>

type AnyMiddleware = Middleware<string, AnyValidationDef, Record<string, any>, Record<string, any>>

interface MiddlewareBuilder<
  Path extends string,
  Validation extends AnyValidationDef,
  Meta extends Record<string, any>
> {
  use: <M extends Record<string, any>>(
    middleware: Middleware<Path, Validation, Meta, M>
  ) => MiddlewareBuilder<Path, Validation, Meta & M>
}
type MiddlewareBuilderFn<
  Path extends string,
  Validation extends AnyValidationDef,
  Meta extends Record<string, any>
> = (
  m: MiddlewareBuilder<Path, Validation, {}>
) => MiddlewareBuilder<Path, Validation, Meta>


type Handler<Path extends string, Def extends AnyValidationDef, R extends Awaitable<HandlerResponseTypes>> = (c: Context<Path, Def>) => R
type AnyHandler = Handler<string, AnyValidationDef, Awaitable<HandlerResponseTypes>>
type AnyRoutes = Record<string, AnyRouteDef>


type ExtractUrlParamNames<T extends string> =
  T extends `${infer _}:${infer Param}/${infer Rest}`
    ? Param | ExtractUrlParamNames<Rest>
    : T extends `${infer _}:${infer Param}`
    ? Param
    : never

/** Get object of params from url string */
type UrlParamSchema<Path extends string> = {
  [K in ExtractUrlParamNames<Path>]: Schema
}

type PrefixKeys<T extends Record<string, any>, P extends string> = {
  [K in keyof T as `${P}${K & string}`]: T[K];
}

type InferValidated<T extends Partial<AnyValidationDef>, P extends keyof AnyValidationDef> =
  P extends keyof T ?
    T[P] extends Schema
    ? Infer<T[P]>
    : unknown
  : unknown

type Context<Path extends string, Def extends Partial<AnyValidationDef>> = {
  body: InferValidated<Def, "body">
  query: InferValidated<Def, "query">
  cookies: InferValidated<Def, "cookies">

  params: Def["params"] extends Record<string, any>
    ? Flatten<{
        [K in ExtractUrlParamNames<Path>]: K extends keyof Def["params"]
          ? Def["params"][K] extends Schema
            ? Infer<Def["params"][K]>
            : string
          : string
      }>
    : { [K in ExtractUrlParamNames<Path>]: string }
}

type HTTPMethod = "all" | "get" | "post" | "put" | "delete" | "patch" | "options" | "head"

interface Rapid<Routes extends Record<string, AnyRouteDef>> {
    all: RegisterHandler<Routes>
    get: RegisterHandler<Routes>
    post: RegisterHandler<Routes>
    put: RegisterHandler<Routes>
    delete: RegisterHandler<Routes>
    patch: RegisterHandler<Routes>
    options: RegisterHandler<Routes>
    head: RegisterHandler<Routes>

    subroute<SubRoutes extends AnyRoutes>(router: Rapid<SubRoutes>): Rapid<Routes & SubRoutes>
    subroute<Path extends string, SubRoutes extends AnyRoutes>(path: Path, router: Rapid<SubRoutes>): Rapid<Flatten<Routes & PrefixKeys<SubRoutes, Path>>>

    router: express.Router
}


export type RapidErrorLogger = (message: string, err?: unknown) => void
class RapidStatic {
  protected static errorLogger: RapidErrorLogger = (m, err) => {
    console.error(`[Rapid Error] ${m}, err:`, err)
  }

  /** Specify a logger for critical errors instead of the standard `console.error` */
  public static setErrorLogger(logger: RapidErrorLogger) {
    this.errorLogger = logger
  }
}


class RapidImpl extends RapidStatic implements Rapid<AnyRoutes> {
  public router = express.Router()

  all(...args: any[]) {
    return this._handler("all", ...args)
  }
  get(...args: any[]) {
    return this._handler("get", ...args)
  }
  post(...args: any[]) {
    return this._handler("post", ...args)
  }
  put(...args: any[]) {
    return this._handler("put", ...args)
  }
  delete(...args: any[]) {
    return this._handler("delete", ...args)
  }
  patch(...args: any[]) {
    return this._handler("patch", ...args)
  }
  options(...args: any[]) {
    return this._handler("options", ...args)
  }
  head(...args: any[]) {
    return this._handler("head", ...args)
  }

  subroute(
    pathOrRouter: string | Rapid<AnyRoutes>,
    _router?: Rapid<AnyRoutes>
  ) {
    if (typeof pathOrRouter === "string") {
      this.router.use(pathOrRouter, _router!.router)
    } else {
      this.router.use(pathOrRouter.router)
    }
    return this
  }

  private async validateToOutput(schemas: Record<string, Schema>, input: Record<string, any>, output: Record<string, any>) {
    for (const key in schemas) {
      const schema = schemas[key]
      if (!schema) continue

      const result = await validate(schema, input[key])
      console.log("validating", key, input[key], result)
      if (!result.success) return {
        key,
        issues: result.issues
      }

      output[key] = result.data
    }
  }

  private _handler(method: HTTPMethod, ...args: any[]) {
    const path = args.shift() as string

    const {
      params: paramsValidator,
      ...validators
    }: Partial<AnyValidationDef> =
      typeof args[0] === "object" ? args.shift() : {}

    const handler = args.pop() as AnyHandler
    const middleware = args as AnyMiddleware[]

    this.router[method](path, async (req, res) => {
      let context: Record<string, any> = {
        req,
        body: req.body,
        query: req.query,
        params: req.params,
        cookies: req.cookies,
      }

      // validate the params
      if (typeof paramsValidator === "object") {
        const err = await this.validateToOutput(
          paramsValidator,
          req.params,
          context.params
        )

        if (err) {
          return sendError(res, {
            code: 404,
            name: "Not Found",
            message: `Invalid route param ${err.key}`,
            cause: err.issues
          })
        }
      }

      // validate body, query and cookies and add them to the context
      const err = await this.validateToOutput(validators as Record<string, Schema>, req, context)
      
      if (err) return sendError(res, {
        code: 400,
        name: "Bad Request",
        message: `Invalid ${err.key}`,
        cause: err.issues
      })

      // run middleware
      for (const m of middleware) {
        try {
          const data = await m(context as any)
          Object.assign(context, data)
        } catch(err) {
          if (err instanceof RapidError) {
            return sendError(res, err)
          } else {
            RapidImpl.errorLogger("An unexpected middleware error occurred while processing the request", err)

            return sendError(res, {
              code: 500,
              name: "Internal Server Error",
              message: "An error occurred while processing the request",
            })
          }
        }
      }

      // run handler
      try {
        const response = await handler(context as any)
        res.send(response)
      } catch (err) {
        if (err instanceof RapidError) return sendError(res, err)

        RapidImpl.errorLogger("An error occurred while processing the request", err)
        return sendError(res, {
          code: 500,
          name: "Internal Server Error",
          message: "An error occurred while processing the request",
        })
      }
    })
    return this
  }
}

type RapidConstructor = typeof RapidStatic & { new(): Rapid<{}> }
export const Rapid = RapidImpl as unknown as RapidConstructor


type CombineMiddleware<P extends string = string, M extends Record<string, any> = {}, V extends Partial<AnyValidationDef> = InitialValidationDef<P>> = {
  <M1, M2>(
    m1: Middleware<P, V, M, M1>,
    m2: Middleware<P, V, MergeMeta<[M, M1]>, M2>
  ): Middleware<P, V, M, MergeMeta<[M, M1, M2]>>

  <M1, M2, M3>(
    m1: Middleware<P, V, M, M1>,
    m2: Middleware<P, V, MergeMeta<[M, M1]>, M2>,
    m3: Middleware<P, V, MergeMeta<[M, M1, M2]>, M3>
  ): Middleware<P, V, M, MergeMeta<[M, M1, M2, M3]>>

  <M1, M2, M3, M4>(
    m1: Middleware<P, V, M, M1>,
    m2: Middleware<P, V, MergeMeta<[M, M1]>, M2>,
    m3: Middleware<P, V, MergeMeta<[M, M1, M2]>, M3>,
    m4: Middleware<P, V, MergeMeta<[M, M1, M2, M3]>, M4>
  ): Middleware<P, V, M, MergeMeta<[M, M1, M2, M3, M4]>>

  <M1, M2, M3, M4, M5>(
    m1: Middleware<P, V, M, M1>,
    m2: Middleware<P, V, MergeMeta<[M, M1]>, M2>,
    m3: Middleware<P, V, MergeMeta<[M, M1, M2]>, M3>,
    m4: Middleware<P, V, MergeMeta<[M, M1, M2, M3]>, M4>,
    m5: Middleware<P, V, MergeMeta<[M, M1, M2, M3, M4]>, M5>
  ): Middleware<P, V, M, MergeMeta<[M, M1, M2, M3, M4, M5]>>

  withContext: <P extends string, V extends Partial<AnyValidationDef>, M extends Record<string, any>>() => CombineMiddleware<P, M, V>
}
export const combineMiddlewares = ((
  ...middlewares: AnyMiddleware[]
) => {
  return async (c: any) => {
    for (const m of middlewares) {
      c = await m(c)
    }
    return c
  }
}) as CombineMiddleware

combineMiddlewares.withContext = (() =>  combineMiddlewares) as any

combineMiddlewares(
  () => ({ a: 1 }),
  (c) => ({ b: c.a + 1 }),
)

type RegisterHandler<Routes extends AnyRoutes> = {

  // base cases without middleware

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>
  >(
    path: P,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>>>) => R
  ): Rapid<AddRoute<Routes, P, InitialValidationDef<P>, R>>
  
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, Schema, Schema, Schema, UrlParamSchema<P>>>
  >(
    path: P,
    schema: S,
    handler: (c: Flatten<Context<P, S>>) => R
  ): Rapid<AddRoute<Routes, P, S, R>>



  // ###########################################################
  // middleware but no validation, up to 20 middleware functions
  // ###########################################################

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1
  >(
    path: P,
    middleware: Middleware<P, InitialValidationDef<P>, {}, M1>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & MergeMeta<[{}, M1]>>) => R
  ): Rapid<AddRoute<Routes, P, InitialValidationDef<P>, R>>
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1, M2
  >(
    path: P,
    middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
    middleware2: Middleware<P, InitialValidationDef<P>, MergeMeta<[{}, M1]>, M2>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & MergeMeta<[{}, M1, M2]>>) => R
  ): Rapid<AddRoute<Routes, P, InitialValidationDef<P>, R>>
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1, M2, M3
  >(
    path: P,
    middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
    middleware2: Middleware<P, InitialValidationDef<P>, MergeMeta<[{}, M1]>, M2>,
    middleware3: Middleware<P, InitialValidationDef<P>, MergeMeta<[{}, M1, M2]>, M3>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & MergeMeta<[{}, M1, M2, M3]>>) => R
  ): Rapid<AddRoute<Routes, P, InitialValidationDef<P>, R>>
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1, M2, M3, M4
  >(
    path: P,
    middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
    middleware2: Middleware<P, InitialValidationDef<P>, MergeMeta<[{}, M1]>, M2>,
    middleware3: Middleware<P, InitialValidationDef<P>, MergeMeta<[{}, M1, M2]>, M3>,
    middleware4: Middleware<P, InitialValidationDef<P>, MergeMeta<[{}, M1, M2, M3]>, M4>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & MergeMeta<[{}, M1, M2, M3, M4]>>) => R
  ): Rapid<AddRoute<Routes, P, InitialValidationDef<P>, R>>
  

  // #############################################################
  // with middleware and validation, up to 4 middleware functions
  // #############################################################

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, Schema, Schema, Schema, UrlParamSchema<P>>>,
    M1
  >(
    path: P,
    schema: S,
    middleware: Middleware<P, S, {}, M1>,
    handler: (c: Flatten<Context<P, S> & MergeMeta<[{}, M1]>>) => R
  ): Rapid<AddRoute<Routes, P, S, R>>

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, Schema, Schema, Schema, UrlParamSchema<P>>>,
    M1, M2
  >(
    path: P,
    schema: S,
    middleware1: Middleware<P, S, {}, M1>,
    middleware2: Middleware<P, S, MergeMeta<[{}, M1]>, M2>,
    handler: (c: Flatten<Context<P, S> & MergeMeta<[{}, M1, M2]>>) => R
  ): Rapid<AddRoute<Routes, P, S, R>>
  
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, Schema, Schema, Schema, UrlParamSchema<P>>>,
    M1, M2, M3
  >(
    path: P,
    schema: S,
    middleware1: Middleware<P, S, {}, M1>,
    middleware2: Middleware<P, S, MergeMeta<[{}, M1]>, M2>,
    middleware3: Middleware<P, S, MergeMeta<[{}, M1, M2]>, M3>,
    handler: (c: Flatten<Context<P, S> & MergeMeta<[{}, M1, M2, M3]>>) => R
  ): Rapid<AddRoute<Routes, P, S, R>>
  
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, Schema, Schema, Schema, UrlParamSchema<P>>>,
    M1, M2, M3, M4
  >(
    path: P,
    schema: S,
    middleware1: Middleware<P, S, {}, M1>,
    middleware2: Middleware<P, S, MergeMeta<[{}, M1]>, M2>,
    middleware3: Middleware<P, S, MergeMeta<[{}, M1, M2]>, M3>,
    middleware4: Middleware<P, S, MergeMeta<[{}, M1, M2, M3]>, M4>,
    handler: (c: Flatten<Context<P, S> & MergeMeta<[{}, M1, M2, M3, M4]>>) => R
  ): Rapid<AddRoute<Routes, P, S, R>>
}

type AddRoute<Routes extends AnyRoutes, P extends string, S, R> = Flatten<
  Routes & { [x in P]: Flatten<S & { path: P, output: R }> }
>