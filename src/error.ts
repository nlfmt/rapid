import type { Response } from 'express'

export type RapidErrorDef = {
  name: string
  code: number
  message?: string
  cause?: any
}
export class RapidError {
  public name: string
  public code: number
  public message?: string
  public cause?: any

  constructor(error: RapidErrorDef) {
    this.name = error.name
    this.code = error.code
    this.message = error.message
    this.cause = error.cause
  }
}

type Errors<T> = { [k in keyof T]: RapidErrorDef }
type ErrorsIn<Keys extends string> = {
  [K in Keys]: [code: number, message: string]
}

/**
 * Creates an object of errors
 * @param errors An object of error declarations
 * @returns An object of errors
 */
export function defineErrors<Keys extends string, T extends ErrorsIn<Keys>>(
  errors: T
): Errors<T> {
  const res = {} as Errors<T>

  for (const k in errors)
    res[k] = { name: k, code: errors[k][0], message: errors[k][1] }

  return res
}

export function sendError(res: Response, error: RapidErrorDef) {
  res.status(error.code).send(error)
}