import { getMyPicksBetween, getMyNextPick, isMyPick, picksSinceCurrPick } from '../behavior/draft'

describe('isMyPick', () => {
  console.log('testing isMyPick...')
  it('has correct behavior', () => {
    expect(isMyPick(9, 10, 10)).toBe(false)
    expect(isMyPick(10, 10, 10)).toBe(true)
    expect(isMyPick(11, 10, 10)).toBe(false)
    expect(isMyPick(20, 10, 10)).toBe(true)
  })
})

describe('getMyNextPick', () => {
  it('has correct behavior', () => {
    expect(getMyNextPick(10, 11, 20)).toBe(30)
  })
})

describe('getMyPicksBetween', () => {
  it('has correct behavior', () => {
    expect(getMyPicksBetween(10, 12, 10, 10)).toBe([10, 11])
  })
})

describe('picksSinceCurrPick', () => {
  console.log('testing picksSinceCurrPick...')
  it('has correct behavior for 12 teams', () => {
    expect(picksSinceCurrPick(6, 6, 6, 12)).toBe(0)
    expect(picksSinceCurrPick(6, 7, 6, 12)).toBe(1)
    expect(picksSinceCurrPick(6, 8, 6, 12)).toBe(1)
  })

  it('has correct behavior for 10 teams', () => {
    expect(picksSinceCurrPick(9, 9, 10, 10)).toBe(1)
    expect(picksSinceCurrPick(9, 10, 10, 10)).toBe(1)
    expect(picksSinceCurrPick(10, 10, 10, 10)).toBe(0)
    expect(picksSinceCurrPick(10, 11, 10, 10)).toBe(1)
    expect(picksSinceCurrPick(10, 12, 10, 10)).toBe(2)

    expect(picksSinceCurrPick(15, 29, 10, 10)).toBe(1)
  })

  // TODO - this test has a runtime error for some reason
  // it('has correct behavior for 10 teams rounds 3', () => {
  //   expect(picksSinceCurrPick(15, 29, 10, 10)).toBe(1)
  // })
})
