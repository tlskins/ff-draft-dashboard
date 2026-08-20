import React from "react"
import {act, render, screen} from "@testing-library/react"

import {
  ReadApiProvider,
  useReadApiResource,
} from "../behavior/api/readApiContext"


describe("read API provider", () => {
  it("shares one in-flight request across mounted consumers", async () => {
    let resolve!: (value: {value: string}) => void
    const loader = jest.fn(() => new Promise<{value: string}>(done => {
      resolve = done
    }))
    const Consumer = ({label}: {label: string}) => {
      const resource = useReadApiResource({
        key: "shared:test",
        loader,
        ttlMs: 1_000,
      })
      return <span>{label}:{resource.state}:{resource.data?.value || "none"}</span>
    }

    render(
      <ReadApiProvider>
        <Consumer label="a" />
        <Consumer label="b" />
      </ReadApiProvider>,
    )

    expect(loader).toHaveBeenCalledTimes(1)
    expect(screen.getByText("a:loading:none")).toBeTruthy()
    expect(screen.getByText("b:loading:none")).toBeTruthy()

    await act(async () => resolve({value: "ready"}))
    expect(screen.getByText("a:ready:ready")).toBeTruthy()
    expect(screen.getByText("b:ready:ready")).toBeTruthy()
  })
})
