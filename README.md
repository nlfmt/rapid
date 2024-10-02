# Rapid
Rapidly create typesafe routes for your express application.

# Installation
Just add the package `@nlfmt/rapid` using your favorite package manager
```sh
pnpm add @nlfmt/rapid
```

## Features
### Zod
Rapid uses [Zod](https://zod.dev/) to validate the request body, query parameters, cookies and route parameters for you. \
This allows you to define the shape of the data you expect to receive and Rapid will automatically validate it for you.

### Typesafe reusable Middleware
Using Rapid, you can define Middleware functions that add context to the route handler. \
They can build on top of each other easily and are fully typesafe.

## Examples
```ts
import { createRouter, ApiError } from "@nlfmt/rapid"
import express from "express"
import z from "zod"

const apiRouter = createRouter()

apiRouter
  .path("/user/:userId")
  .params({
    // rapid automatically infers the param names from the url
    userId: z.string().min(1),
  })
  .body(
    z.object({
      username: z.string().regex(
        /^[a-zA-Z1-9_.]{3,}$/g,
        "Username can only contain letters, underscores and dots"
      ),
      password: z.string().min(6)
    })
  )
  // rapid performs the input validation for you
  // and types `body`, `params` and more accordingly
  .put(({ body, params }) => {
    const user = db.user.findById(params.userId)
    if (!user)
      throw new ApiError({
        code: 404,
        name: "NOT_FOUND",
        message: "User not found",
      })
        
    return db.user.updateById(params.userId, body)
  })

const app = express()
app.use(express.json())
app.use("/api", apiRouter.router)

app.listen(3000)
```
For more examples, check out the [examples](examples) directory.

## Contributing
Take a look at the [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.


## License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.



```ts
const app = new Rapid()
  .path("/user", {
    body: z.object({
      username: z.string().min(3),
      password: z.string().min(6)
    })
  })
  .get(({ body }) => {
    return db.user.create(body)
  })

  .path("/user/:userId")
  .validate({
    params: z.object({
      userId: z.string().min(1)
    })
  })
  .get(({ params }) => {
    return db.user.findById(params.userId)
  })
  .put(({ params, body }) => {
    return db.user.updateById(params.userId, body)
  })
```ts