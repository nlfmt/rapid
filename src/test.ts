import { z, ZodString } from "zod"
import { Context, ContextAfter, GetRoutes, InitialContext, middleware, Rapid } from "."
import express from "express"
import cookieParser from "cookie-parser"
import "@typeschema/zod"

const myBodySchema = z.object({
  name: z.string(),
})

const testMdlware = middleware((c: { params: { id: string }, a: string }) => {
    return { juhu: 4 }
})

const combined = middleware.after<typeof testMdlware>()(
  (c) => {
    return { combined: c.params.id }
  },
  (c) => {
  },
)

Rapid.setErrorLogger((message) => {
  console.error("myerror:", message)
})

const userRouter = new Rapid()
  .get("/:id", (c) => `User ${c.params.id}`)
  .post("/", (c) => `Create user`)

const app = new Rapid()
  .subroute("/user", userRouter)
  .post(
    "/greet/:id",
    {
      body: myBodySchema,
      params: {
        id: z.string().regex(/^\d+$/),
      },
    },

    (c) => ({ a: "1" }),
    c => ({ async_b: 1 }),
    combined,
    testMdlware,

    (c) => {
      return {
        greeting: `Hello, ${c.body.name}!`,
        paramsId: c.params.id,
        a: c.a,
        async_b: c.async_b,
        juhu: c.juhu,
        combined: c.combined
      }
    }
  )
  .post(
    "/greet2/:name",
    {
      params: {
        name: z.string(),
      },
      body: z.object({
        name: z.string(),
      }),
      cookies: z.object({
        aCookie: z.string(),
      }),
      query: z.object({
        someQuery: z.string(),
      }),
    },
    (c) => ({ a: 1 }),
    (c) => ({ b: 1 }),
    (c) => ({ c: 1 }),
    (c) => ({ d: 1 }),
    (c) => `Hello ${c.params.name}!,  ${c.a} ${c.b} ${c.c} ${c.d}`
  )

const myApp = new Rapid()
  .get("/hello", (c) => "Hello, World!")

type routes = GetRoutes<typeof myApp>

const expressApp = express()
expressApp.use(express.json())
expressApp.use(cookieParser())
expressApp.use(app.router)

const PORT = 3000
expressApp.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`)
})
