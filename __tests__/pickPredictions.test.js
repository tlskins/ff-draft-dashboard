import {
  getMyPicksBetween,
  getMyNextPick,
  isMyPick,
  picksSinceCurrPick,
  myCurrentRound,
} from '../behavior/draft'

describe('isMyPick', () => {
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

describe('myCurrentRound', () => {
  it('has correct behavior', () => {
    expect(myCurrentRound(10, 9, 10)).toBe(2)
    expect(myCurrentRound(11, 9, 10)).toBe(2)
    expect(myCurrentRound(12, 9, 10)).toBe(3)
    expect(myCurrentRound(13, 9, 10)).toBe(3)
    expect(myCurrentRound(14, 9, 10)).toBe(3)
  })
})
