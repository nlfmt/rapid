import { z } from "zod"
import express from "express"
import { createRouter } from "../src/index"


// create a router for "test", usually this would be in a different file
const testRouter = createRouter()


// define a simple route for a GET request to /api/test
testRouter
  .path("")
  .get(() => {
    // you can either use the return statement, or manually use
    // express' Response object, which allows more configuration (status code, streaming, sending files, ...)
    return "Hello, World!"
  })


// Code to test the route defined above
async function test1() {
  const res = await fetch("http://localhost:3000/api/test")
  const data = await res.text()
  console.log("Test 1:", data, "\nstatus code:", res.status)
}


// define a route for a POST request to /api/test/route1
// define the shape of the request body to be a json object
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

async function test2() {
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

  console.log("Test 2:", res)
}


// define an api router that can be mounted under /api
// then add all other routers as subrouters, so /api/test/route1 is the resulting
const apiRouter = createRouter()
apiRouter.subroute("/test", testRouter)


// create express app and make it use the api router
const app = express()
app.use(express.json())
app.use("/api", apiRouter.router)


app.listen(3000, async () => {
  console.log("Server started on port 3000")

  await test1()
  await test2()

  process.exit(0)
})
