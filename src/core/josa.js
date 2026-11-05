// Korean particles after a word: 이/가, 을/를, 은/는, 와/과 by whether its
// last syllable ends in a consonant (망치가, 물총이, 모자를, 목도리를…).
const batchim = (w) => { const c = (w ?? '').trim().charCodeAt((w ?? '').trim().length - 1) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
export const ga = (w) => `${w}${batchim(w) ? '이' : '가'}`;
export const eul = (w) => `${w}${batchim(w) ? '을' : '를'}`;
