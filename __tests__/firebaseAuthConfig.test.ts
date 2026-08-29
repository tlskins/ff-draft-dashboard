import {draftyFirebaseConfig} from "../behavior/firebaseAuth"


describe("Drafty Firebase browser configuration", () => {
  it("requires all public authentication coordinates", () => {
    expect(draftyFirebaseConfig({})).toBeNull()
    expect(draftyFirebaseConfig({
      NEXT_PUBLIC_FIREBASE_API_KEY: "public-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "drafty.firebaseapp.com",
    })).toBeNull()
  })

  it("returns only public Firebase configuration", () => {
    expect(draftyFirebaseConfig({
      NEXT_PUBLIC_FIREBASE_API_KEY: " public-key ",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: " drafty.firebaseapp.com ",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: " drafty-project ",
    })).toEqual({
      apiKey: "public-key",
      authDomain: "drafty.firebaseapp.com",
      projectId: "drafty-project",
    })
  })
})
