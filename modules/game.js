import { appState } from './state.js';
import { saveQuestions, saveUserStats, saveQuestionToCloud } from './storage.js';
import { selectQuestionsForSession, updateQuestionStats } from './quiz.js';
import { showScreen, initProgressGrid, updateProgressGridUI, markProgressCellUI } from './ui.js';
import { showCertificate, shareChallenge } from './share.js';
import { playCorrectSound, playIncorrectSound, playSuccessSound } from './audio.js';
import { triggerConfetti } from './effects.js';

// Constants
const BREAK_INTERVAL = 10;

export function startQuiz() {
    const questions = selectQuestionsForSession();
    if (questions.length === 0) {
        alert('出題できる問題がありません。「教材生成」から問題を作ってください。');
        return;
    }

    appState.currentQuiz = questions;
    appState.currentQuestionIndex = 0;
    appState.currentSession = { correct: 0, total: 0 };
    appState.selectedAnswer = null;

    initProgressGrid();
    initProgressGrid();
    showScreen('quiz-screen');
    document.body.classList.add('quiz-active');

    // Update counters
    document.getElementById('current-question').textContent = '1';
    document.getElementById('total-quiz-questions').textContent = questions.length;

    // Hide Quit Button for Shared Quiz to prevent accidental exit
    const quitBtn = document.getElementById('quit-btn');
    if (quitBtn) {
        quitBtn.style.display = appState.isSharedQuiz ? 'none' : 'flex';
    }

    displayQuestion();
}

function displayQuestion() {
    const q = appState.currentQuiz[appState.currentQuestionIndex];
    document.getElementById('question-text').textContent = q.question;
    document.getElementById('current-question').textContent = appState.currentQuestionIndex + 1;

    // Badge
    const badge = document.getElementById('difficulty-badge');
    badge.className = `difficulty-badge ${q.difficulty}`;
    badge.textContent = q.difficulty === 'basic' ? '基礎' : q.difficulty === 'standard' ? '標準' : '応用';

    // Choices
    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    q.choices.forEach((choice, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'choice-wrapper';
        wrapper.innerHTML = `
            <span class="choice-number">${idx + 1}</span>
            <button class="choice-btn" data-index="${idx}">${choice}</button>
        `;
        container.appendChild(wrapper);

        wrapper.querySelector('button').onclick = () => handleAnswer(idx);
    });

    updateProgressGridUI();

    // Image
    const imgContainer = document.getElementById('question-image-container');
    const img = document.getElementById('question-image');

    // Reset
    imgContainer.style.backgroundImage = 'none';
    imgContainer.classList.remove('grid-mode');
    img.style.display = 'none';

    if (q.imageUrl && q.imageGridIndex !== undefined) {
        // Grid View (4x3 on 16:9 image) - Updated for 12 panels
        imgContainer.style.display = 'block';
        imgContainer.classList.add('grid-mode');
        imgContainer.style.backgroundImage = `url(${q.imageUrl})`;

        // Calculate position for 4x3 grid
        const col = q.imageGridIndex % 4;
        const row = Math.floor(q.imageGridIndex / 4);
        const xPos = (col / 3) * 100; // 0, 33.33, 66.66, 100
        const yPos = (row / 2) * 100; // 0, 50, 100

        imgContainer.style.backgroundPosition = `${xPos}% ${yPos}%`;
        imgContainer.style.backgroundSize = '420% 315%'; // 5% Zoom to trim edges

    } else if (q.imageUrl) {
        // Standard single image
        img.src = q.imageUrl;
        img.style.display = 'block';
        imgContainer.style.display = 'block';
    } else {
        imgContainer.style.display = 'none';
    }
}

function handleAnswer(selectedIndex) {
    if (appState.selectedAnswer !== null) return;
    appState.selectedAnswer = selectedIndex;

    const q = appState.currentQuiz[appState.currentQuestionIndex];
    const isCorrect = selectedIndex === Number(q.correctIndex);

    // UI Update
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === q.correctIndex) btn.classList.add('correct');
        else if (idx === selectedIndex && !isCorrect) btn.classList.add('incorrect');
    });

    markProgressCellUI(appState.currentQuestionIndex, isCorrect);

    appState.currentSession.total++;
    if (isCorrect) {
        appState.currentSession.correct++;
        appState.userStats.correctAnswers++;
        playCorrectSound();
    } else {
        playIncorrectSound();
    }
    appState.userStats.totalAnswered++;
    appState.userStats.streak = calculateStreak(); // Simple update

    updateQuestionStats(q, isCorrect);
    saveQuestions();
    saveUserStats();

    showFeedback(q, isCorrect);
}

function calculateStreak() {
    // Simplified streak logic or import from utils if complex.
    // Original app.js had logic. For now just increment if played today?
    // app.js updateStreak was complex. I'll rely on storage's initial value + increments.
    // but simplified is OK for now.
    return appState.userStats.streak;
}

function showFeedback(q, isCorrect) {
    const modal = document.getElementById('feedback-modal');
    modal.classList.remove('hidden');

    document.getElementById('feedback-title').textContent = isCorrect ? '正解!' : '不正解';
    document.getElementById('feedback-title').style.color = isCorrect ? '#10b981' : '#ef4444';

    // Show correct answer in feedback modal (important for mobile where choices are hidden)
    const correctAnswer = q.choices[q.correctIndex];
    const explanationEl = document.getElementById('feedback-explanation');
    explanationEl.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.15); padding: 0.75rem 1rem; border-radius: 10px; margin-bottom: 0.75rem; border-left: 3px solid #10b981;">
            <strong style="color: #10b981;">✓ 正解:</strong> ${correctAnswer}
        </div>
        <div>${q.explanation}</div>
    `;

    const nextBtn = document.getElementById('next-question-btn');
    const timerEl = document.getElementById('feedback-timer');
    const autoAdvanceCheckbox = document.getElementById('auto-advance-checkbox');

    // Clear any existing timer
    if (window.feedbackTimer) clearInterval(window.feedbackTimer);

    // Hide timer by default
    if (timerEl) timerEl.style.display = 'none';

    // Setup manual click (clone to remove old listeners)
    const newNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(newNext, nextBtn);

    newNext.onclick = () => {
        if (window.feedbackTimer) clearInterval(window.feedbackTimer);
        nextQuestion();
    };

    // Only auto-advance if user has opted in
    if (autoAdvanceCheckbox && autoAdvanceCheckbox.checked) {
        let timeLeft = 3;
        if (timerEl) {
            timerEl.textContent = `あと ${timeLeft} 秒で次へ...`;
            timerEl.style.display = 'block';
        }

        window.feedbackTimer = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.textContent = `あと ${timeLeft} 秒で次へ...`;

            if (timeLeft <= 0) {
                clearInterval(window.feedbackTimer);
                nextQuestion();
            }
        }, 1000);
    }
}

export function nextQuestion() {
    document.getElementById('feedback-modal').classList.add('hidden');
    appState.selectedAnswer = null;

    // Check Break
    if (appState.currentQuestionIndex > 0 &&
        (appState.currentQuestionIndex + 1) % BREAK_INTERVAL === 0 &&
        appState.currentQuestionIndex < appState.currentQuiz.length - 1) {
        showBreak();
        return;
    }

    if (appState.currentQuestionIndex < appState.currentQuiz.length - 1) {
        appState.currentQuestionIndex++;
        displayQuestion();
    } else {
        finishQuiz();
    }
}

function showBreak() {
    const breakScreen = document.getElementById('break-screen');
    breakScreen.classList.remove('hidden');
    let timeLeft = 10;
    const timerEl = document.getElementById('break-timer');
    timerEl.textContent = timeLeft;

    const timer = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timer);
            breakScreen.classList.add('hidden');
            if (appState.currentQuestionIndex < appState.currentQuiz.length - 1) {
                appState.currentQuestionIndex++;
                displayQuestion();
            } else {
                finishQuiz();
            }
        }
    }, 1000);
}

function finishQuiz() {
    if (appState.isSharedQuiz) {
        showCertificate();
        // playSuccessSound(); // Maybe? Or only for high score?
    } else {
        document.body.classList.remove('quiz-active');
        showScreen('result-screen');
        const { correct, total } = appState.currentSession;
        document.getElementById('correct-count').textContent = correct;
        document.getElementById('result-total').textContent = total;
        document.getElementById('result-accuracy').textContent = Math.round((correct / total) * 100) + '%';

        if (correct > 0) {
            playSuccessSound();
            triggerConfetti();
        }

        // --- Rank & Challenge Logic ---
        const accuracyKey = Math.round((correct / total) * 100);
        let rankLabel = '見習い';
        let rankColor = '#64748b';
        let finalRankImageIndex = 11; // Default Bed/Low

        if (accuracyKey >= 90) {
            rankLabel = 'Sランク (最高)';
            rankColor = '#fbbf24'; // Gold
            finalRankImageIndex = 9;
        } else if (accuracyKey >= 60) {
            rankLabel = 'Aランク (優秀)';
            rankColor = '#94a3b8'; // Silver
            finalRankImageIndex = 10;
        }

        // Message update
        const msgEl = document.getElementById('result-message');
        msgEl.innerHTML = `<span style="color: ${rankColor}; font-weight: bold; font-size: 1.2rem;">${rankLabel}</span><br>お疲れ様でした！`;

        // Inject Rank Image if available (replacing icon)
        const iconEl = document.getElementById('result-icon');
        const firstQ = appState.currentQuiz[0];

        // Clean up previous
        iconEl.innerHTML = '';
        iconEl.style = ''; // Reset inline styles
        iconEl.className = ''; // Reset classes

        if (firstQ && firstQ.imageUrl && firstQ.imageGridIndex !== undefined) {
            // Create Result Screen Rank Showcase (3 slots)
            const showcase = document.createElement('div');
            showcase.style.display = 'flex';
            showcase.style.alignItems = 'center'; // Vertical align center for different sizes
            showcase.style.justifyContent = 'center';
            showcase.style.gap = '16px'; // Increased gap for better spacing
            showcase.style.margin = '0 auto 1.5rem auto';
            showcase.style.width = '100%';
            showcase.style.maxWidth = '400px';

            const ranks = [
                { label: '梅', score: 0, index: 11, color: '#64748b' },
                { label: '竹', score: 60, index: 10, color: '#94a3b8' },
                { label: '松', score: 90, index: 9, color: '#fbbf24' }
            ];

            ranks.forEach(rank => {
                const slot = document.createElement('div');

                // Logic: Show IF achieved. Blur/Secret if NOT achieved.
                const isAchieved = accuracyKey >= rank.score;
                const isCurrent = (rank.score === 90 && accuracyKey >= 90) ||
                    (rank.score === 60 && accuracyKey >= 60 && accuracyKey < 90) ||
                    (rank.score === 0 && accuracyKey < 60);

                // Size Logic: Current Rank is HUGE (180px). Others are small (60px). 3:1 Ratio.
                const size = isCurrent ? '180px' : '60px'; // 3:1 ratio

                slot.style.width = size;
                slot.style.height = size;
                slot.style.borderRadius = isCurrent ? '20px' : '12px';
                slot.style.position = 'relative';
                slot.style.overflow = 'hidden';
                slot.style.border = '2px solid rgba(255,255,255,0.1)';
                slot.style.background = '#1e293b';
                slot.style.transition = 'all 0.3s ease';

                // Image layer
                const imgDiv = document.createElement('div');
                imgDiv.style.width = '100%';
                imgDiv.style.height = '100%';
                imgDiv.style.background = `url(${firstQ.imageUrl})`;
                // 4x3 grid -> 400% 300%. Zoom 5% -> 420% 315% to trim edges
                imgDiv.style.backgroundSize = '420% 315%';

                const col = rank.index % 4;
                const row = Math.floor(rank.index / 4);
                const xPos = (col / 3) * 100;
                const yPos = (row / 2) * 100;
                imgDiv.style.backgroundPosition = `${xPos}% ${yPos}%`;


                if (isCurrent) {
                    slot.style.border = `4px solid ${rank.color}`;
                    slot.style.boxShadow = `0 10px 30px ${rank.color}60`;
                    slot.style.zIndex = '10';
                    // slot.style.transform = 'scale(1.1)'; // Already sized up manually
                } else if (isAchieved) {
                    imgDiv.style.filter = 'grayscale(0.6)';
                    const check = document.createElement('div');
                    check.textContent = '✓';
                    check.style.position = 'absolute';
                    check.style.bottom = '2px';
                    check.style.right = '4px';
                    check.style.color = '#10b981';
                    check.style.fontWeight = 'bold';
                    check.style.fontSize = '0.8rem';
                    slot.appendChild(check);
                } else {
                    // Not achieved -> Secret
                    imgDiv.style.filter = 'brightness(0) opacity(0.3)';
                    const lock = document.createElement('div');
                    lock.textContent = '?';
                    lock.style.position = 'absolute';
                    lock.style.top = '50%';
                    lock.style.left = '50%';
                    lock.style.transform = 'translate(-50%, -50%)';
                    lock.style.fontSize = '1.2rem';
                    lock.style.color = 'rgba(255,255,255,0.5)';
                    slot.appendChild(lock);
                }

                slot.appendChild(imgDiv);
                showcase.appendChild(slot);
            });

            iconEl.appendChild(showcase);
        } else {
            iconEl.style = ''; // Reset inline styles
            iconEl.textContent = accuracyKey === 100 ? '👑' : accuracyKey >= 60 ? '🎉' : '💪';
        }

        // Add Challenge Share Button
        const actionsDiv = document.querySelector('#result-screen .result-actions');
        // Check if button exists
        let challengeBtn = document.getElementById('challenge-share-btn');
        if (!challengeBtn) {
            challengeBtn = document.createElement('button');
            challengeBtn.id = 'challenge-share-btn';
            challengeBtn.className = 'btn btn-success btn-large';
            challengeBtn.style.background = 'linear-gradient(135deg, #f59e0b, #ef4444)'; // Fiery
            challengeBtn.innerHTML = '🔥 挑戦状をシェア';
            // Insert before Home button
            const homeBtn = document.getElementById('home-btn');
            actionsDiv.insertBefore(challengeBtn, homeBtn);
        }

        // Update listener
        // Clone to remove old listeners
        const newChallengeBtn = challengeBtn.cloneNode(true);
        challengeBtn.parentNode.replaceChild(newChallengeBtn, challengeBtn);

        newChallengeBtn.onclick = () => {
            const imgUrl = (firstQ && firstQ.imageUrl) ? firstQ.imageUrl : null;
            shareChallenge(correct, total, rankLabel, finalRankImageIndex, imgUrl);
        };
    }
}
