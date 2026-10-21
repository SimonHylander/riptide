import { QueryResult } from "@confect/react"
import { Unauthorized } from "@riptide/backend/confect/errors"
import { describe, expect, it } from "vitest"

import { FeedResult } from "../port"
import { toFeedResult } from "./convexFeed"

class Outage {
  readonly _tag = "Outage"
}

describe("toFeedResult", () => {
  it("maps loading, skipped or not, to Loading", () => {
    expect(toFeedResult(QueryResult.load(false))).toBe(FeedResult.loading)
    expect(toFeedResult(QueryResult.load(true))).toBe(FeedResult.loading)
  })

  it("passes a success value through by reference", () => {
    const hosts = [{ host: "desktop", updatedAt: 60_000 }]
    const result = toFeedResult(QueryResult.succeed(hosts))
    expect(result).toEqual(FeedResult.ready(hosts))
    expect(result._tag === "Ready" && result.value).toBe(hosts)
  })

  it("keeps a null live snapshot as Ready null", () => {
    expect(toFeedResult(QueryResult.succeed(null))).toEqual(FeedResult.ready(null))
  })

  it("maps Unauthorized to unauthorized and any other typed error to unavailable", () => {
    expect(toFeedResult(QueryResult.fail(new Unauthorized()))).toEqual(FeedResult.failed("unauthorized"))
    expect(toFeedResult(QueryResult.fail(new Outage()))).toEqual(FeedResult.failed("unavailable"))
  })
})
