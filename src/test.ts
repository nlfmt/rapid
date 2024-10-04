// import { z } from "zod"
// import { combineMiddlewares, Rapid } from "./route-builder"
// import express from "express"
// import cookieParser from "cookie-parser"
// import "@typeschema/zod"

// const myBodySchema = z.object({
//   name: z.string(),
// })

// // combineMiddlewares(
// //   (c) => {
// //     console.log(c.params.id)
// //   },
// //   (c) => {
// //     console.log(c.params.id)
// //   }
// // )

// const testMdlware = (c: { params: { id: string }, a: string }) => { console.log(c.params.id, c.a); return { juhu: 4 } }

// Rapid.setErrorLogger((message) => {
//   console.error("myerror:", message)
// })

// const userRouter = new Rapid()
//   .get("/:id", (c) => `User ${c.params.id}`)
//   .post("/", (c) => `Create user`)

// const app = new Rapid()
//   .subroute("/user", userRouter)
//   .post(
//     "/greet/:id",
//     {
//       body: myBodySchema,
//       params: {
//         id: z.string(),
//       },
//     },

//     (c) => ({ a: "1" }),
//     async c => ({ async_b: 1 }),
//     c => ({ b: 1 }),
//     testMdlware,

//     (c) => {
//       console.log(c)
//       return `Hello, ${c.body.name}!`
//     }
//   )
//   .post(
//     "/greet2/:name",
//     {
//       params: {
//         name: z.string(),
//       },
//       body: z.object({
//         name: z.string(),
//       }),
//       cookies: z.object({
//         aCookie: z.string(),
//       }),
//       query: z.object({
//         someQuery: z.string(),
//       }),
//     },
//     (c) => ({ a: 1 }),
//     (c) => ({ b: 1 }),
//     (c) => ({ c: 1 }),
//     (c) => ({ d: 1 }),
//     (c) => `Hello ${c.params.name}!,  ${c.a} ${c.b} ${c.c} ${c.d}`
//   )

// const expressApp = express()
// expressApp.use(express.json())
// expressApp.use(cookieParser())
// expressApp.use(app.router)

// expressApp.listen(3000, () => {
//   console.log("Server started")
// })
