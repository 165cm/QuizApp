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

// Mini Review Logic
let miniReviewInterval = null;
let quizReadyCallback = null; // Callback to show preview when user is ready

export function startMiniReview() {
    quizReadyCallback = null; // Reset state
    const container = document.getElementById('mini-review-container');
    if (!container) return;

    // Show container
    container.classList.remove('hidden');

    // Get candidate questions (prioritize review due)
    const candidates = appState.questions.length > 0
        ? appState.questions
        : null;

    if (!candidates) {
        container.innerHTML = '<p class="mini-review-label">復習する問題がまだありません。</p>';
        return;
    }

    renderNextMiniQuestion();
}

// Called when quiz generation is complete
export function signalQuizReady(callback) {
    quizReadyCallback = callback;
    // Update the floating container if it exists
    const floatingContainer = document.getElementById('mini-review-floating');
    if (floatingContainer) {
        // Show a notification that quiz is ready (clickable)
        const notification = document.createElement('div');
        notification.id = 'quiz-ready-banner';
        notification.style.cssText = `
            background: linear-gradient(135deg, #10b981, #059669);
            padding: 0.75rem;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 1rem;
            cursor: pointer;
            transition: transform 0.2s;
        `;
        notification.innerHTML = '✨ クイズの生成が完了しました！<br><span style="font-size: 0.8rem; opacity: 0.9;">タップして確認 →</span>';

        // Make banner clickable
        notification.addEventListener('click', () => {
            if (quizReadyCallback) {
                const cb = quizReadyCallback;
                quizReadyCallback = null;
                stopMiniReview();
                cb();
            }
        });

        notification.addEventListener('mouseenter', () => {
            notification.style.transform = 'scale(1.02)';
        });
        notification.addEventListener('mouseleave', () => {
            notification.style.transform = 'scale(1)';
        });

        // Insert at top if not already there
        if (!document.getElementById('quiz-ready-banner')) {
            floatingContainer.insertBefore(notification, floatingContainer.firstChild);
        }
    } else if (callback) {
        // No mini-review active, show preview immediately
        callback();
    }
}

export function stopMiniReview() {
    const container = document.getElementById('mini-review-container');
    if (container) container.classList.add('hidden');

    // Remove floating container
    const floatingContainer = document.getElementById('mini-review-floating');
    if (floatingContainer) {
        floatingContainer.remove();
    }
}

function renderNextMiniQuestion() {
    // Create or get the floating container
    let floatingContainer = document.getElementById('mini-review-floating');
    if (!floatingContainer) {
        floatingContainer = document.createElement('div');
        floatingContainer.id = 'mini-review-floating';
        floatingContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 1.5rem;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        `;
        document.body.appendChild(floatingContainer);
    }

    // Pick random question  
    const q = appState.questions[Math.floor(Math.random() * appState.questions.length)];
    if (!q) {
        floatingContainer.innerHTML = '<p style="color: #f1f5f9; text-align: center;">復習する問題がありません</p>';
        return;
    }

    // Try multiple property names for question text (local vs cloud format)
    const questionText = q.question || q.question_text || q.text || 'Question text not found';

    // Handle correctIndex (local) vs correct_answer (cloud)
    let correctIdx = q.correctIndex;
    if (correctIdx === undefined && q.correct_answer && q.choices) {
        correctIdx = q.choices.indexOf(q.correct_answer);
    }
    const explanation = q.explanation || '';

    // Render Question with spinner indicator
    floatingContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 0.5rem;">
            <div style="width: 16px; height: 16px; border: 2px solid #6366f1; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <p style="color: #94a3b8; font-size: 0.9rem; margin: 0;">クイズ生成中... 待っている間に復習しよう！</p>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        <div style="color: #f1f5f9; font-size: 1rem; margin-bottom: 1rem; line-height: 1.5;">${questionText}</div>
        <div id="mini-choices" style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${q.choices ? q.choices.map((c, i) => `
                <button class="mini-choice-btn" data-index="${i}" style="
                    padding: 0.75rem 1rem;
                    background: rgba(30, 41, 59, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                    color: #f1f5f9;
                    font-size: 0.9rem;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s;
                ">${c}</button>
            `).join('') : '<p style="color: #ef4444;">選択肢が見つかりません</p>'}
        </div>
        <div id="mini-feedback" style="display: none; margin-top: 1rem; padding: 0.75rem; border-radius: 8px; text-align: center; font-weight: 600;"></div>
        <div id="mini-explanation" style="display: none; margin-top: 0.75rem; padding: 0.75rem; background: rgba(99, 102, 241, 0.1); border-radius: 8px; color: #a5b4fc; font-size: 0.9rem;"></div>
        <button id="mini-next-btn" style="display: none; margin-top: 1rem; width: 100%; padding: 0.75rem; background: #6366f1; border: none; border-radius: 10px; color: white; font-size: 0.9rem; cursor: pointer;">次の問題へ ➡</button>
    `;

    // Add Listeners
    floatingContainer.querySelectorAll('.mini-choice-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selected = parseInt(e.target.dataset.index);
            const isCorrect = selected === correctIdx;
            const feedback = document.getElementById('mini-feedback');
            const explanationEl = document.getElementById('mini-explanation');
            const nextBtn = document.getElementById('mini-next-btn');

            // Disable and style all buttons
            floatingContainer.querySelectorAll('.mini-choice-btn').forEach(b => {
                b.style.pointerEvents = 'none';
                b.style.opacity = '0.7';
                if (parseInt(b.dataset.index) === correctIdx) {
                    b.style.background = 'rgba(16, 185, 129, 0.3)';
                    b.style.borderColor = '#10b981';
                } else if (parseInt(b.dataset.index) === selected && !isCorrect) {
                    b.style.background = 'rgba(239, 68, 68, 0.3)';
                    b.style.borderColor = '#ef4444';
                }
            });

            feedback.textContent = isCorrect ? '正解！🎉' : '残念...';
            feedback.style.display = 'block';
            feedback.style.background = isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            feedback.style.color = isCorrect ? '#10b981' : '#ef4444';

            // Show explanation if available
            if (explanation) {
                explanationEl.innerHTML = `<strong>📖 解説:</strong> ${explanation}`;
                explanationEl.style.display = 'block';
            }

            // If quiz is ready, change button text
            if (quizReadyCallback) {
                nextBtn.textContent = '✨ 生成されたクイズを確認する';
                nextBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            }
            nextBtn.style.display = 'block';
        });

        // Hover effect
        btn.addEventListener('mouseenter', () => {
            if (btn.style.pointerEvents !== 'none') {
                btn.style.background = 'rgba(99, 102, 241, 0.2)';
                btn.style.borderColor = '#6366f1';
            }
        });
        btn.addEventListener('mouseleave', () => {
            if (btn.style.pointerEvents !== 'none') {
                btn.style.background = 'rgba(30, 41, 59, 0.7)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }
        });
    });

    document.getElementById('mini-next-btn')?.addEventListener('click', () => {
        if (quizReadyCallback) {
            // Quiz is ready, call callback and cleanup
            const callback = quizReadyCallback;
            quizReadyCallback = null;
            stopMiniReview();
            callback();
        } else {
            renderNextMiniQuestion();
        }
    });
}
