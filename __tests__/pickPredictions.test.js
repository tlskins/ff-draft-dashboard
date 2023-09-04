import { getMyPicksBetween, getMyNextPick, isMyPick, picksSinceCurrPick } from '../behavior/draft'

describe('isMyPick', () => {
  console.log('testing isMyPick...')
  it('has correct behavior', () => {
    expect(isMyPick(9, 10, 10)).toBe(false)
    expect(isMyPick(10, 10, 10)).toBe(true)
    expect(isMyPick(11, 10, 10)).toBe(true)
    expect(isMyPick(20, 10, 10)).toBe(false)
    expect(isMyPick(18, 6, 12)).toBe(false)
  })
})

describe('getMyNextPick', () => {
  it('has correct behavior', () => {
    expect(getMyNextPick(11, 10, 10)).toBe(30)
  })
})

describe('getMyPicksBetween', () => {
  it('has correct behavior', () => {
    expect(getMyPicksBetween(10, 12, 10, 10)).toStrictEqual([11])
  })
})

describe('picksSinceCurrPick', () => {
  console.log('testing picksSinceCurrPick...')
  it('has correct behavior for pick 6 in 12 teams', () => {
    expect(picksSinceCurrPick(6, 6, 6, 12)).toBe(0)
    expect(picksSinceCurrPick(6, 7, 6, 12)).toBe(1)
    expect(picksSinceCurrPick(6, 8, 6, 12)).toBe(1)
    expect(picksSinceCurrPick(18, 18, 6, 12)).toBe(1)
  })

  it('has correct behavior for pick 10 in 10 teams', () => {
    expect(picksSinceCurrPick(9, 9, 10, 10)).toBe(1)
    expect(picksSinceCurrPick(9, 10, 10, 10)).toBe(2)
    expect(picksSinceCurrPick(10, 10, 10, 10)).toBe(0)
    expect(picksSinceCurrPick(10, 11, 10, 10)).toBe(2)
    expect(picksSinceCurrPick(10, 12, 10, 10)).toBe(2)
    expect(picksSinceCurrPick(15, 29, 10, 10)).toBe(1)
  })
})
