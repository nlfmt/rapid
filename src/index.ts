import { Request, Response, Router } from "express"
import z from "zod"
import { ApiError, Error } from "./error"

export * from "./error"

type HttpMethod =
  | "all"
  | "get"
  | "post"
  | "put"
  | "delete"
  | "patch"
  | "options"
  | "head"


export type Overwrite<TType extends object, TWith> = undefined extends TWith
  ? TType & Partial<NonNullable<TWith>>
  : TType & NonNullable<TWith>

export type Flatten<T> = T extends object ? { [K in keyof T]: T[K] } : T

/** Extract Param Names from a route string */
type ExtractUrlParamNames<T extends string> =
  T extends `${infer _}:${infer Param}/${infer Rest}`
    ? Param | ExtractUrlParamNames<Rest>
    : T extends `${infer _}:${infer Param}`
    ? Param
    : never

/** Get object of params from url string */
type UrlParamSchema<Path extends string> = { [K in ExtractUrlParamNames<Path>]: z.ZodSchema<string> }

type RouteSchema = {
  path: string
  body: z.ZodSchema
  query: z.ZodSchema
  cookies: z.ZodSchema
  params: z.ZodSchema
  data: object | null
}

export type ErrorFunction = (error: Error) => void

/**
 * Route Handler function
 */
export type RouteHandler<Schema extends RouteSchema> = (v: {
  body: z.infer<Schema["body"]>
  query: z.infer<Schema["query"]>
  cookies: z.infer<Schema["cookies"]>
  params: ExtractUrlParamNames<Schema["path"]> extends never
    ? null
    : Schema["params"] extends z.ZodSchema<null>
      ? { [K in ExtractUrlParamNames<Schema["path"]>]: string }
      : z.infer<Schema["params"]>
  ctx: Schema["data"]
}) => void

type ConstrainedSchema<Keys, Schema> = {
  [K in keyof Schema]: K extends Keys ? Schema[K] : never;
};

type NoCommonKeys<T, U> = keyof T & keyof U extends never ? T : "Return type contains a property that is already defined by another middleware";
type Awaitable<T> = T | Promise<T>
/**
 * A middleware function that can be used to modify the context of a route
 */
type MiddlewareFunction<
  TData extends object,
  TDataNew extends object | undefined | void,
> = (data: TData) => Awaitable<NoCommonKeys<TDataNew, TData>>

type InitialContext = {
  req: Request
  res: Response
}

/**
 * Create a middleware function that can be used to modify the context of a route
 */
export const middleware = <
  TData extends InitialContext,
  TDataNew extends object | undefined
>(
  fn: MiddlewareFunction<TData, TDataNew>
) => fn

/**
 * Route Builder class that allows for easy creation of routes
 */
export class RouteBuilder<
  Path extends string,
  TBody extends z.ZodSchema = z.ZodSchema<null>,
  TQuery extends z.ZodSchema = z.ZodSchema<null>,
  TCookies extends z.ZodSchema = z.ZodSchema<null>,
  TParams extends z.ZodSchema = z.ZodSchema<null>,
  TData extends object = InitialContext,
  Schema extends RouteSchema = { path: Path; body: TBody; query: TQuery; cookies: TCookies, params: TParams, data: TData }
> {
  public router: Router
  private bodySchema?: TBody
  private querySchema?: TQuery
  private cookieSchema?: TCookies
  private paramSchema?: TParams
  private middleware: MiddlewareFunction<TData, TData>[] = []
  private path: Path

  constructor(router: Router, path: Path, opts?: { body?: TBody; cookies?: TCookies; query?: TQuery }) {
    this.path = path
    this.router = router
    this.bodySchema = opts?.body
    this.querySchema = opts?.query
    this.cookieSchema = opts?.cookies
  }

  /**
   * Add a middleware function to the route
   * - Data returned from this function will be merged into the context
   * - use `throw new ApiError(...)` to send an error response and stop the route
   */
  use<TDataNew extends object | undefined | void>(middleware: MiddlewareFunction<TData, TDataNew>) {
    this.middleware.push(middleware as unknown as MiddlewareFunction<TData, TData>)
    return this as unknown as RouteBuilder<Path, TBody, TQuery, TCookies, TParams, Flatten<Overwrite<TData, TDataNew>>>
  }

  /**
   * Specify a body schema
   * @param schema
   */
  body<BodySchema extends z.ZodSchema>(schema: BodySchema) {
    this.bodySchema = schema as unknown as TBody
    return this as unknown as RouteBuilder<Path, BodySchema, TQuery, TCookies, TParams, TData>
  }

  /**
   * Specify a query schema
   * @param schema 
   */
  query<QuerySchema extends z.ZodSchema>(schema: QuerySchema) {
    this.querySchema = schema as unknown as TQuery
    return this as unknown as RouteBuilder<Path, TBody, QuerySchema, TCookies, TParams, TData>
  }

  /**
   * Specify a param schema
   * @param schema 
   */
  params<ParamSchema extends UrlParamSchema<Path>>(schema: ConstrainedSchema<ExtractUrlParamNames<Path>, ParamSchema>) {
    const zodSchema = z.object(schema)
    this.paramSchema = zodSchema as unknown as TParams
    return this as unknown as RouteBuilder<Path, TBody, TQuery, TCookies, typeof zodSchema, TData>
  }

  /**
   * SPecify a cookie schema
   * @param schema 
   */
  cookies<CookiesSchema extends z.ZodSchema>(schema: CookiesSchema) {
    this.cookieSchema = schema as unknown as TCookies
    return this as unknown as RouteBuilder<Path, TBody, TQuery, CookiesSchema, TParams, TData>
  }

  /**
   * Specify all input schemas at once
   * @param schema 
   */
  input<
    BodySchema extends z.ZodSchema = z.ZodSchema<null>,
    QuerySchema extends z.ZodSchema = z.ZodSchema<null>,
    CookiesSchema extends z.ZodSchema = z.ZodSchema<null>
  >(schema: {
    body?: BodySchema
    query?: QuerySchema
    cookies?: CookiesSchema
  }) {
    this.bodySchema = schema.body as unknown as TBody
    this.querySchema = schema.query as unknown as TQuery
    this.cookieSchema = schema.cookies as unknown as TCookies
    return this as unknown as RouteBuilder<
      Path,
      BodySchema,
      QuerySchema,
      CookiesSchema,
      TParams,
      TData
    >
  }

  private applyRoute(method: HttpMethod, handler: RouteHandler<Schema>) {
    this.router[method](this.path, async (req, res) => {
      const error = (error: Error) => {
        res.status(error.code).json(error)
      }

      const data = {
        body: null,
        query: null,
        cookies: null,
        params: null,
      }

      if(this.paramSchema) {
        const params = this.paramSchema.safeParse(req.params)
        if (!params.success)
          return error({ code: 400, name: "BAD_REQUEST", message: "Invalid Parameters", cause: params.error.flatten() })
        data.params = params.data
      }

      if (this.bodySchema) {
        const body = this.bodySchema.safeParse(req.body)
        if (!body.success)
          return error({ code: 400, name: "BAD_REQUEST", message: "Invalid Body", cause: body.error.flatten() })
        data.body = body.data
      }

      if (this.querySchema) {
        const queryParams = this.querySchema.safeParse(req.query)
        if (!queryParams.success)
          return res
            .status(400)
            .json({ code: 400, name: "BAD_REQUEST", message: "Invalid Query Params", cause: queryParams.error.flatten() })
        data.query = queryParams.data
      }

      if (this.cookieSchema) {
        const cookies = this.cookieSchema.safeParse(req.cookies)
        if (!cookies.success)
          return res
            .status(400)
            .json({ code: 400, name: "BAD_REQUEST", message: "Invalid Cookies", cause: cookies.error.flatten() })
        data.cookies = cookies.data
      }

      let middlewareData = { req, res } as unknown as TData
      
      try {
        for (const middleware of this.middleware) {
          const newData = await middleware(middlewareData)
          if (typeof newData === "object") {
            middlewareData = { ...middlewareData, ...newData }
          }
        }

        handler({
          body: data.body,
          cookies: data.cookies,
          query: data.query,
          params: data.params as unknown as z.infer<Schema["params"]>,
          ctx: middlewareData as TData,
        })
      } catch (err) {
        if (err instanceof ApiError) {
          return error(err)
        } else {
          console.error(err)
          return error({
            code: 500,
            name: "INTERNAL_SERVER_ERROR",
            message: "An internal server error occurred",
          })
        }
      }
    })
  }

  all(handler: RouteHandler<Schema>) {
    this.applyRoute("all", handler)
  }

  get(handler: RouteHandler<Schema>) {
    this.applyRoute("get", handler)
  }

  post(handler: RouteHandler<Schema>) {
    this.applyRoute("post", handler)
  }

  put(handler: RouteHandler<Schema>) {
    this.applyRoute("put", handler)
  }

  delete(handler: RouteHandler<Schema>) {
    this.applyRoute("delete", handler)
  }

  patch(handler: RouteHandler<Schema>) {
    this.applyRoute("patch", handler)
  }

  options(handler: RouteHandler<Schema>) {
    this.applyRoute("options", handler)
  }

  head(handler: RouteHandler<Schema>) {
    this.applyRoute("head", handler)
  }

  subroute(router: RouteBuilder<string>): void
  subroute(path: string, router: RouteBuilder<string>): void
  subroute(pathOrRouter: string | RouteBuilder<string>, router?: RouteBuilder<string>) {
    if (typeof pathOrRouter === "string") {
      this.router.use(pathOrRouter, router!.router)
    } else {
      this.router.use(pathOrRouter.router)
    }
  }
}


export function createRouter() {
  const router: Router = Router()

  return {
    router,
    path<Path extends string>(path: Path) {
      return new RouteBuilder<Path>(router, path)
    },
    subroute(path: string, routeBuilder: { router: Router }) {
      router.use(path, routeBuilder.router)
    }
  }
}
