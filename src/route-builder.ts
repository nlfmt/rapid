import { z, ZodSchema, ZodString, ZodUnknown } from "zod"
import { Flatten } from "."
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
    Body extends ZodSchema,
    Query extends ZodSchema,
    Cookies extends ZodSchema,
    Params extends UrlParamSchema<Path>,
> = {
    body?: Body
    query?: Query
    params?: Params
    cookies?: Cookies
}
type AnyValidationDef = ValidationDef<string, ZodSchema, ZodSchema, ZodSchema, Record<string,any>>
type InitialValidationDef<Path extends string> = ValidationDef<Path, ZodUnknown, ZodUnknown, ZodUnknown, UrlParamSchema<Path>>

type Merge<A extends Record<string, any>, B extends Record<string, any>> = Flatten<{
    [K in keyof A]: K extends keyof B ? B[K] : A[K]
}>

interface RouteDef<
    Path extends string,
    Body extends ZodSchema,
    Query extends ZodSchema,
    Params extends UrlParamSchema<Path>,
    Cookies extends ZodSchema,
    Output extends Awaitable<HandlerResponseTypes>
> extends ValidationDef<Path, Body, Query, Cookies, Params> {
    path: Path
    response: ResponseTransformer<Output>
}
type AnyRouteDef = RouteDef<string, any, any, any, any, Awaitable<HandlerResponseTypes>>


type NoDisallowedMetaKeys<Meta extends Record<string, any>, NewMeta extends Record<string, any>> = {
    [K in keyof NewMeta]:
      K extends keyof Context<string, AnyValidationDef>
        ? `Middleware data can't contain key <${K}>, since it is a key of the base context`
      : K extends keyof Meta
        ? K extends string ? `Middleware data can't contain key <${K}>, since it's been specified by another middleware` : `Middleware data contains a key that's been specified by another middleware`
        : NewMeta[K]
}

type Middleware<
  Path extends string,
  Validation extends AnyValidationDef,
  Meta extends Record<string, any>,
  AddedMeta extends Record<string, any>
> = (
  c: Flatten<Context<Path, Validation> & Meta>
) => NoDisallowedMetaKeys<Meta, AddedMeta>

type AnyMiddleware = Middleware<string, AnyValidationDef, {}, Record<string, any>>

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
  [K in ExtractUrlParamNames<Path>]: z.ZodSchema
}

type PrefixKeys<T extends Record<string, any>, P extends string> = {
  [K in keyof T as `${P}${K & string}`]: T[K];
}

type Context<Path extends string, Def extends Partial<AnyValidationDef>> = {
    body: Def["body"] extends ZodSchema ? z.infer<Def["body"]> : unknown
    query: Def["query"] extends ZodSchema ? z.infer<Def["query"]> : unknown
    cookies: Def["cookies"] extends ZodSchema ? z.infer<Def["cookies"]> : unknown
    params: Def["params"] extends Record<string, any> ? Flatten<{ [K in ExtractUrlParamNames<Path>]: string } & { [x in keyof Def["params"]]: z.infer<Def["params"][x]> }> : { [K in ExtractUrlParamNames<Path>]: string } 
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


// @ts-ignore "excessively deep type", who cares
class RapidImpl implements Rapid<AnyRoutes> {
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

    subroute(pathOrRouter: string | Rapid<AnyRoutes>, _router?: Rapid<AnyRoutes>) {
        if (typeof pathOrRouter === "string") {
            this.router.use(pathOrRouter, _router!.router)
        } else {
            this.router.use(pathOrRouter.router)
        }
        return this
    }

    private _handler(method: HTTPMethod, ...args: any[]) {
        const path = args.shift() as string

        const hasValidators = typeof args[0] === "object"
        const validators = hasValidators
          ? args.shift() as AnyValidationDef
          : { body: null, query: null, params: null, cookies: null }

        const handler = args.pop() as AnyHandler
        const middleware = args as AnyMiddleware[]

        this.router[method](path, async (req, res) => {
            let context = {
                body: validators.body ? validators.body.parse(req.body) : req.body,
                query: validators.query ? validators.query.parse(req.query) : req.query,
                params: validators.params ? validators.params.parse(req.params) : req.params,
                cookies: validators.cookies ? validators.cookies.parse(req.cookies) : req.cookies,
            }

            for (const m of middleware) {
              const data = await m(context)
              Object.assign(context, data)
            }

            const response = await handler(context)
            res.send(response)
        })
        return this
    }
}

export const Rapid = RapidImpl as unknown as { new(): Rapid<{}> }


const userRouter = new Rapid()
  .get("/:id", (c) => `User ${c.params.id}`)
  .post("/", (c) => `Create user`)

const app = new Rapid()
  .subroute("/user", userRouter)
  .post(
    "/greet",
    {
      body: z.object({
        name: z.string(),
      }),
    },
    c => ({ a: 1 }),
    c => ({ b: 1 }),
    c => ({ c: 1 }),
    c => ({ d: 1 }),
    (c) => {
      console.log(c)
      return `Hello, ${c.body.name}!`
    }
  )
  .get("/greet/:name",
    {
      params: {
        name: z.string()
      },
      body: z.object({
        name: z.string(),
      }),
      cookies: z.object({
        aCookie: z.string()
      }),
      query: z.object({
        someQuery: z.string()
      })
    },
    c => ({ a: 1 }),
    c => ({ b: 1 }),
    c => ({ c: 1 }),
    c => ({ d: 1 }),
    (c) => `Hello ${c.params.name}!,  ${c.a} ${c.b} ${c.c} ${c.d}`
  )




type test<T extends Rapid<AnyRoutes>> = T extends Rapid<infer R> ? R : never
type res = test<typeof app>

const expressApp = express()
expressApp.use(express.json())
expressApp.use(app.router)

expressApp.listen(3000, () => {
    console.log("Server started")
})


// function combineMiddleware<
  


type RegisterHandler<Routes extends AnyRoutes> = {

  // base cases without middleware

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>
  >(
    path: P,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>>>) => R
  ): Rapid<
    Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>
  >;
  
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>
  >(
    path: P,
    schema: S,
    handler: (c: Flatten<Context<P, S>>) => R
  ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;



  // ###########################################################
  // middleware but no validation, up to 20 middleware functions
  // ###########################################################

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1 extends Record<string, any>,
  >(
    path: P,
    middleware: Middleware<P, InitialValidationDef<P>, {}, M1>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1>) => R
  ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1 extends Record<string, any>,
    M2 extends Record<string, any>,
  >(
    path: P,
    middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
    middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2>) => R
  ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1 extends Record<string, any>,
    M2 extends Record<string, any>,
    M3 extends Record<string, any>,
  >(
    path: P,
    middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
    middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
    middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3>) => R
  ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    M1 extends Record<string, any>,
    M2 extends Record<string, any>,
    M3 extends Record<string, any>,
    M4 extends Record<string, any>,
  >(
    path: P,
    middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
    middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
    middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
    middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
    handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4>) => R
  ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  //   M18 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   middleware18: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17, M18>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  //   M18 extends Record<string, any>,
  //   M19 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   middleware18: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17, M18>,
  //   middleware19: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18, M19>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18 & M19>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  //   M18 extends Record<string, any>,
  //   M19 extends Record<string, any>,
  //   M20 extends Record<string, any>,
  // >(
  //   path: P,
  //   middleware1: Middleware<P, InitialValidationDef<P>, {}, M1>,
  //   middleware2: Middleware<P, InitialValidationDef<P>, M1, M2>,
  //   middleware3: Middleware<P, InitialValidationDef<P>, M1 & M2, M3>,
  //   middleware4: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   middleware18: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17, M18>,
  //   middleware19: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18, M19>,
  //   middleware20: Middleware<P, InitialValidationDef<P>, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18 & M19, M20>,
  //   handler: (c: Flatten<Context<P, InitialValidationDef<P>> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18 & M19 & M20>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: InitialValidationDef<P> & { path: P; response: R } }>>;



  // #############################################################
  // with middleware and validation, up to 20 middleware functions
  // #############################################################

  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
    M1 extends Record<string, any>
  >(
    path: P,
    schema: S,
    middleware: Middleware<P, S, {}, M1>,
    handler: (c: Flatten<Context<P, S> & M1>) => R
  ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
    M1 extends Record<string, any>,
    M2 extends Record<string, any>
  >(
    path: P,
    schema: S,
    middleware1: Middleware<P, S, {}, M1>,
    middleware2: Middleware<P, S, M1, M2>,
    handler: (c: Flatten<Context<P, S> & M1 & M2>) => R
  ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
    M1 extends Record<string, any>,
    M2 extends Record<string, any>,
    M3 extends Record<string, any>,
  >(
    path: P,
    schema: S,
    middleware1: Middleware<P, S, {}, M1>,
    middleware2: Middleware<P, S, M1, M2>,
    middleware3: Middleware<P, S, M1 & M2, M3>,
    handler: (c: Flatten<Context<P, S> & M1 & M2 & M3>) => R
  ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  <
    P extends string,
    R extends Awaitable<HandlerResponseTypes>,
    S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
    M1 extends Record<string, any>,
    M2 extends Record<string, any>,
    M3 extends Record<string, any>,
    M4 extends Record<string, any>,
  >(
    path: P,
    schema: S,
    middleware1: Middleware<P, S, {}, M1>,
    middleware2: Middleware<P, S, M1, M2>,
    middleware3: Middleware<P, S, M1 & M2, M3>,
    middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
    handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4>) => R
  ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  //   M18 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   middleware18: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17, M18>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  //   M18 extends Record<string, any>,
  //   M19 extends Record<string, any>,
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   middleware18: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17, M18>,
  //   middleware19: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18, M19>,
  //   handler: (c: Flatten<Context<P, S> & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18 & M19>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;

  // <
  //   P extends string,
  //   R extends Awaitable<HandlerResponseTypes>,
  //   S extends Partial<ValidationDef<P, ZodSchema, ZodSchema, ZodSchema, UrlParamSchema<P>>>,
  //   M1 extends Record<string, any>,
  //   M2 extends Record<string, any>,
  //   M3 extends Record<string, any>,
  //   M4 extends Record<string, any>,
  //   M5 extends Record<string, any>,
  //   M6 extends Record<string, any>,
  //   M7 extends Record<string, any>,
  //   M8 extends Record<string, any>,
  //   M9 extends Record<string, any>,
  //   M10 extends Record<string, any>,
  //   M11 extends Record<string, any>,
  //   M12 extends Record<string, any>,
  //   M13 extends Record<string, any>,
  //   M14 extends Record<string, any>,
  //   M15 extends Record<string, any>,
  //   M16 extends Record<string, any>,
  //   M17 extends Record<string, any>,
  //   M18 extends Record<string, any>,
  //   M19 extends Record<string, any>,
  //   M20 extends Record<string, any>
  // >(
  //   path: P,
  //   schema: S,
  //   middleware1: Middleware<P, S, {}, M1>,
  //   middleware2: Middleware<P, S, M1, M2>,
  //   middleware3: Middleware<P, S, M1 & M2, M3>,
  //   middleware4: Middleware<P, S, M1 & M2 & M3, M4>,
  //   middleware5: Middleware<P, S, M1 & M2 & M3 & M4, M5>,
  //   middleware6: Middleware<P, S, M1 & M2 & M3 & M4 & M5, M6>,
  //   middleware7: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6, M7>,
  //   middleware8: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7, M8>,
  //   middleware9: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8, M9>,
  //   middleware10: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9, M10>,
  //   middleware11: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10, M11>,
  //   middleware12: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11, M12>,
  //   middleware13: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12, M13>,
  //   middleware14: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13, M14>,
  //   middleware15: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14, M15>,
  //   middleware16: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15, M16>,
  //   middleware17: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16, M17>,
  //   middleware18: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17, M18>,
  //   middleware19: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18, M19>,
  //   middleware20: Middleware<P, S, M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18 & M19, M20>,
  //   handler: (c: Flatten<Context<P, S & M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 & M12 & M13 & M14 & M15 & M16 & M17 & M18 & M19 & M20>>) => R
  // ): Rapid<Flatten<Routes & { [x in P]: Flatten<S & { path: P; response: R }> }>>;
}