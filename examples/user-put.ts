import { ApiError, createRouter } from "@nlfmt/rapid"
import express from "express"
import z from "zod"

type User = { username: string, password: string }
const db = {
  user: {
    _data: {
      abcdefg: {
        username: "nlfmt",
        password: "hashed-password",
      },
    },
    findById(id: string): User | null {
      return this._data[id] ?? null
    },
    updateById(id: string, data: User): User {
      this._data[id] = {...this._data[id], ...data}
      return this._data[id]
    }
  },
}

const apiRouter = createRouter()

apiRouter
  .path("/user/:userId")
  .params({
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

app.listen(3000, async () => {

  const res = await fetch("http://localhost:3000/api/user/abcdefg", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "invalid user name",
      password: "hi12345"
    })
  }).then(res => res.json())
  console.log(res)
})
