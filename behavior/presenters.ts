import { camelCase, isArray, isObject, transform } from 'lodash';

export const toCamelCase = (obj: any): any => {
    if (!isObject(obj)) {
        return obj;
    }
    if (isArray(obj)) {
        return obj.map(v => toCamelCase(v));
    }
    return transform(obj, (result: any, value: any, key: string) => {
        const newKey = camelCase(key);
        if (newKey === 'ranks') {
            result[newKey] = transform(value, (ranksResult: any, rankValue: any, rankKey: string) => {
                ranksResult[rankKey] = toCamelCase(rankValue);
            });
        } else {
            result[newKey] = toCamelCase(value);
        }
    });
}; 