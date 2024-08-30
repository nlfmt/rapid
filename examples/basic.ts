import { z } from "zod"
import { createRouter } from "../src/index"
import express from "express"

const testRouter = createRouter()

testRouter
  .path("")
  .use(ctx => {
    return { a: 5 }
  })
  .get(({ ctx }) => {
    ctx.res.send("Hello, World!")
  })

testRouter
  .path("/route1")
  .body(
    z.object({
      some_prop: z.string().min(1),
      another_prop: z.number(),
    })
  )
  .post(({ ctx, body }) => {
    console.log("request to /route1 with body:", body)

    ctx.res.send({
      greeting: `Hello, ${body.some_prop}!`,
      result: body.another_prop * 2,
    })
  })

const apiRouter = createRouter()
apiRouter.subroute("/test", testRouter)

const app = express()
app.use(express.json())

app.use("/api", apiRouter.router)

app.listen(3000, async () => {
  console.log("Server started on port 3000")

  // Test the /api/test route
  const res = await fetch("http://localhost:3000/api/test/route1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      some_prop: "hello",
      another_prop: 5,
    }),
  }).then(res => res.json())

  console.log("response:", res)
})
