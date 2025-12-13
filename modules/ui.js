import { appState } from './state.js';
import { getReviewDueCount } from './quiz.js';
import { renderInterestsChart, renderWeakPoints } from './stats.js';

export function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none'; // Ensure display none for animation reset
    });
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.style.display = 'block';
        // Force reflow for animation
        void screen.offsetWidth;
        screen.classList.add('active');
    }
}

export function updateStatsUI() {
    const stats = appState.userStats;
    const reviewCount = getReviewDueCount();

    // Streak
    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.textContent = stats.streak;

    // Stats
    const totalEl = document.getElementById('total-questions');
    if (totalEl) totalEl.textContent = appState.questions.length;

    const accuracy = stats.totalAnswered > 0
        ? Math.round((stats.correctAnswers / stats.totalAnswered) * 100)
        : 0;
    const accEl = document.getElementById('accuracy-rate');
    if (accEl) accEl.textContent = accuracy + '%';

    const reviewEl = document.getElementById('review-count');
    if (reviewEl) reviewEl.textContent = reviewCount;
}

export function updateReportUI() {
    // Hero Stats
    const stats = appState.userStats;
    const answered = document.getElementById('total-answered');
    const correct = document.getElementById('total-correct');

    if (answered) answered.textContent = stats.totalAnswered;
    if (correct) correct.textContent = stats.correctAnswers;

    // Charts
    renderInterestsChart('interests-chart-container');
    renderWeakPoints('weak-points-container');
}

export function updateMaterialSelectUI() {
    const select = document.getElementById('material-select');
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="all">全ての問題からランダム</option><option value="review-priority">復習待ち優先</option>';

    // Sort by recent
    const materials = [...appState.materials].sort((a, b) =>
        new Date(b.uploadDate) - new Date(a.uploadDate)
    ).slice(0, 10);

    materials.forEach(material => {
        const option = document.createElement('option');
        option.value = material.id;
        const count = appState.questions.filter(q => q.materialId === material.id).length;
        option.textContent = `${material.title} (${count}問)`;
        select.appendChild(option);
    });

    select.value = currentValue || 'review-priority';
}

export function initProgressGrid() {
    const grid = document.getElementById('quiz-progress-grid');
    if (!grid) return;
    grid.innerHTML = '';
    appState.currentQuiz.forEach((_, index) => {
        const cell = document.createElement('div');
        cell.className = 'progress-cell';
        cell.textContent = index + 1;
        cell.id = `progress-cell-${index}`;
        grid.appendChild(cell);
    });
}

export function updateProgressGridUI() {
    document.querySelectorAll('.progress-cell').forEach(cell => cell.classList.remove('current'));
    const current = document.getElementById(`progress-cell-${appState.currentQuestionIndex}`);
    if (current) current.classList.add('current');
}

export function markProgressCellUI(index, isCorrect) {
    const cell = document.getElementById(`progress-cell-${index}`);
    if (cell) {
        cell.classList.remove('current');
        cell.classList.add(isCorrect ? 'correct' : 'incorrect');
    }
}
