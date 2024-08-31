import { ApiError, ContextAfter, createRouter, middleware } from "@nlfmt/rapid"
import { readFile } from "fs/promises"
import express from "express"
import path from "path"


// using rapid you can define typesafe reusable middleware,
// that can build on top of each other

const myRouter = createRouter()

// using a middleware directly in a route:
myRouter
  .path("")
  .use(ctx => {
    return {
      middlewareMessage: "This is some custom data injected by the middleware",
    }
  })
  .get(({ ctx }) => {
    // auto-completion in the route handler, it knows what properties the middleware has set
    // try changing the property name above from "middlewareMessage" to something else,
    // you will get a type error when trying to access it
    console.log("got this message from the middleware:", ctx.middlewareMessage)
    ctx.res.sendStatus(200)
  })

async function test1() {
  await fetch("http://localhost:3000")
}

myRouter
  .path("/advanced")
  .use(async ctx => {
    const basicExample = await readFile(path.join(__dirname, "basic.ts"))
    return { basicExample }
  })
  .get(({ ctx }) => {
    return ctx.basicExample
  })

async function test2() {
  const res = await fetch("http://localhost:3000/advanced").then(res =>
    res.text()
  )
  console.log("Test 2:", res)
}

// defining a reusable middleware

// middleware always has to return an object, either empty or filled with new context data.
// it cannot overwrite properties set by other middleware, but don't worry, you will get a type error
// if you happen to do it by accident
const MyMiddleware = middleware(ctx => {
  return { somedata: "hello" }
})

const GetAuthHeader = middleware(async ctx => {
  return { authorization: ctx.req.headers.authorization }
})

// create a middleware that depends on another middleware by specifying the context
const IsValidPassword = middleware(
  (ctx: ContextAfter<typeof GetAuthHeader>) => {
    if (ctx.authorization !== "secret password")
      throw new ApiError({
        code: 401,
        name: "UNAUTHORIZED",
        message: "Wrong Password",
      })
    return { hello: 5 }
  }
)

myRouter
  .path("/test3")
  .use(MyMiddleware)
  .get(({ ctx }) => {
    ctx.res.send(ctx.somedata)
  })

async function test3() {
  const res = await fetch("http://localhost:3000/test3").then(res => res.text())
  console.log("Test 3:", res)
}

myRouter
  .path("/test4")
  .use(GetAuthHeader)
  .use(IsValidPassword)
  .post(({ ctx }) => {
    ctx.res.send("You sent a valid password!")
  })

async function test4() {
  const res = await fetch("http://localhost:3000/test4", {
    method: "POST"
  }).then(res => res.text())

  console.log("Test 4:", res)

  const res2 = await fetch("http://localhost:3000/test4", {
    method: "POST",
    headers: {
      Authorization: "secret password"
    }
  }).then(res => res.text())

  console.log("Test 4 with password:", res2)
}

const app = express()
app.use(express.json())
app.use(myRouter.router)

app.listen(3000, async () => {
  console.log("server started on port 3000")

  await test1()
  await test2()
  await test3()
  await test4()

  process.exit(0)
})
