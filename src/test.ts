import { z } from "zod";
import { Rapid } from "./route-builder";

const app = new Rapid()
    .path("/test")
    .params(z.object({
        id: z.number()
    }))
    .all(c => {
        return {
            test: "abc"
        }
    })
    