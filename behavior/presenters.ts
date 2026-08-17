import { camelCase, isArray, isObject, transform } from 'lodash';

export const toCamelCase = (obj: any, skiplist: string[] = []): any => {
    if (!isObject(obj)) {
        return obj;
    }
    if (isArray(obj)) {
        return obj.map(v => toCamelCase(v, skiplist));
    }
    return transform(obj, (result: any, value: any, key: string) => {
        let newKey = camelCase(key);
        if (skiplist.includes(key)) {
            newKey = key
        }

        if (newKey === 'ranks') {
            result[newKey] = transform(value, (ranksResult: any, rankValue: any, rankKey: string) => {
                ranksResult[rankKey] = toCamelCase(rankValue, skiplist);
            });
        } else {
            result[newKey] = toCamelCase(value, skiplist);
        }
    });
}; 

export const playerShortName = (fullName: string) => {
    const nameParts = fullName.split(' ')
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ').trim()
    return `${firstName.charAt(0)}. ${lastName}`
}

const ordinal = (value: number): string => {
    const tens = value % 100
    if (tens >= 11 && tens <= 13) return `${value}th`
    switch (value % 10) {
        case 1: return `${value}st`
        case 2: return `${value}nd`
        case 3: return `${value}rd`
        default: return `${value}th`
    }
}

/**
 * Presents an opponent-prediction availability window in user-turn language.
 * The value is a user-pick window index, not a count of intervening draft picks.
 */
export const predictionAvailabilityWindowLabel = (
    window: number,
): string | null => {
    if (!Number.isInteger(window) || window < 0) return null
    if (window === 0) return "In play on your current turn"
    if (window === 1) return "At risk before your next pick"
    if (window === 2) return "At risk before your following pick"
    return `At risk before your ${ordinal(window)} future pick`
}

/** Compact visual companion to predictionAvailabilityWindowLabel. */
export const predictionAvailabilityCompactCue = (
    window: number,
): string | null => {
    if (!Number.isInteger(window) || window < 0) return null
    if (window === 0) return "RISK NOW"
    if (window === 1) return "RISK NEXT"
    return `RISK NEXT+${window - 1}`
}
