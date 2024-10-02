import { z } from "zod";
import { Rapid } from "./route-builder";

const app = new Rapid()
    .get("/", { body: z.object({ hi: z.string() }) }, c => {
        return {
            hi: "there"
        }
    })
    