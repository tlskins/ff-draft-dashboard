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