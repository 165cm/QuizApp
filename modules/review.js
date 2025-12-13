import { appState } from './state.js';
import { showScreen } from './ui.js';
import { isReviewDue } from './quiz.js';

export function showReviewList() {
    const reviewQuestions = appState.questions.filter(q => isReviewDue(q));
    const container = document.getElementById('review-questions-list');
    container.innerHTML = '';
    document.getElementById('review-list-count').textContent = reviewQuestions.length;

    if (reviewQuestions.length === 0) {
        container.innerHTML = '<div class="empty-message">復習待ちの問題はありません</div>';
        showScreen('review-list-screen');
        return;
    }

    const groupedByMaterial = {};
    reviewQuestions.forEach(q => {
        if (!groupedByMaterial[q.materialId]) groupedByMaterial[q.materialId] = [];
        groupedByMaterial[q.materialId].push(q);
    });

    Object.keys(groupedByMaterial).forEach(materialId => {
        const material = appState.materials.find(m => m.id === materialId);
        const questions = groupedByMaterial[materialId];
        const section = document.createElement('div');
        section.className = 'review-material-section';
        section.innerHTML = `
            <div class="review-material-header">
                <h3>${material ? material.title : '不明な教材'}</h3>
                <span class="review-count-badge">${questions.length}問</span>
            </div>
        `;
        const list = document.createElement('div');
        list.className = 'review-question-items';
        questions.forEach(q => {
            const item = document.createElement('div');
            item.className = 'review-question-item';
            const nextReviewDate = new Date(q.nextReview);
            const daysOverdue = Math.floor((new Date() - nextReviewDate) / (1000 * 60 * 60 * 24));
            item.innerHTML = `
                <div class="review-question-text">${q.question}</div>
                <div class="review-question-meta">
                    <span class="review-difficulty ${q.difficulty}">${q.difficulty === 'basic' ? '基礎' : q.difficulty === 'standard' ? '標準' : '応用'}</span>
                    <span class="review-overdue">${daysOverdue > 0 ? `${daysOverdue}日経過` : '本日'}</span>
                </div>
            `;
            list.appendChild(item);
        });
        section.appendChild(list);
        container.appendChild(section);
    });
    showScreen('review-list-screen');
}
