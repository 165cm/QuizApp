import { appState } from './state.js';

export function getTagStats() {
    const tagStats = {};
    appState.questions.forEach(q => {
        if (q.tags && Array.isArray(q.tags)) {
            q.tags.forEach(tag => {
                if (!tagStats[tag]) tagStats[tag] = { total: 0, correct: 0 };
                // Count all questions for interests, but only reviewed ones for accuracy
                tagStats[tag].total++;
                if (q.reviewCount > 0 && q.easeFactor > 2.5) {
                    // Simple heuristic for correct: reviewCount > 0 usually means answered properly once. 
                    tagStats[tag].correct++;
                }
            });
        }
    });
    return tagStats;
}

export function renderInterestsChart(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const tagStats = getTagStats();
    const tags = Object.keys(tagStats);
    if (tags.length === 0) {
        container.innerHTML = '<div class="empty-message">データがありません</div>';
        return;
    }

    const sortedByCount = tags.sort((a, b) => tagStats[b].total - tagStats[a].total).slice(0, 5);
    const maxCount = Math.max(...sortedByCount.map(t => tagStats[t].total), 1);

    sortedByCount.forEach(tag => {
        const count = tagStats[tag].total;
        const percentage = (count / maxCount) * 100;

        const row = document.createElement('div');
        row.className = 'chart-row';
        row.innerHTML = `
            <div class="chart-label">${tag}</div>
            <div class="chart-bar-container">
                <div class="chart-bar" style="width: ${percentage}%"></div>
            </div>
            <div class="chart-value">${count}問</div>
        `;
        container.appendChild(row);
    });
}

export function renderWeakPoints(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const tagStats = getTagStats();
    const tags = Object.keys(tagStats).filter(tag => tagStats[tag].total >= 3); // Min 3 questions to judge

    // Calculate accuracy
    const weakTags = tags.map(tag => {
        const { total, correct } = tagStats[tag];
        const accuracy = Math.round((correct / total) * 100);
        return { tag, accuracy, total };
    })
        .filter(item => item.accuracy < 60)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 3);

    if (weakTags.length === 0) {
        container.innerHTML = '<div class="weak-point-empty">弱点は見つかりませんでした。順調です！🎉</div>';
        return;
    }

    weakTags.forEach(item => {
        const card = document.createElement('div');
        card.className = 'weak-point-card';
        card.innerHTML = `
            <div class="weak-point-icon">⚠️</div>
            <div class="weak-point-info">
                <div class="weak-point-title">${item.tag}</div>
                <div class="weak-point-desc">正解率 ${item.accuracy}% (${item.total}問中)</div>
            </div>
        `;
        container.appendChild(card);
    });
}
