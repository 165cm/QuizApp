export function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

export function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric'
    });
}

// LZ-string logic or wrapper if needed, but since it's global from index.html script tag, 
// we might access LZString directly or wrap it here.
// For now, assuming LZString is available globally.
export function compressData(data) {
    if (typeof LZString === 'undefined') return null;
    return LZString.compressToEncodedURIComponent(JSON.stringify(data));
}
