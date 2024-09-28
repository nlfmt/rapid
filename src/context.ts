import { Request } from "express"
import { StatusMap, StatusResolvable } from "./status_codes"

class RapidResponse<Status extends StatusResolvable = 200> {

}

interface Context<TBody, TQuery, TParams, THeaders, TCookies, TMeta> {
    path: string
    body: TBody
    query: TQuery
    params: TParams
    headers: THeaders
    cookies: TCookies
    meta: TMeta

    request: Request

    redirect: (path: string) => RapidResponse
    status: (code: number) => void
    error: <Status extends StatusResolvable>(code: Status, message?: string) => RapidResponse<Status>
}
