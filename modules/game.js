import { appState } from './state.js';
import { saveQuestions, saveUserStats, saveQuestionToCloud } from './storage.js';
import { selectQuestionsForSession, updateQuestionStats } from './quiz.js';
import { showScreen, initProgressGrid, updateProgressGridUI, markProgressCellUI } from './ui.js';
import { showCertificate, shareChallenge } from './share.js';
import { playCorrectSound, playIncorrectSound, playSuccessSound } from './audio.js';
import { triggerConfetti } from './effects.js';

// Constants
const BREAK_INTERVAL = 10;

// Carousel interaction handler for explanation slides
function setupCarouselInteraction(carousel) {
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.explanation-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    const hint = carousel.querySelector('.carousel-hint');
    let currentIndex = 0;
    let startX = 0;
    let isDragging = false;

    function goToSlide(index) {
        if (index < 0) index = 0;
        if (index >= slides.length) index = slides.length - 1;

        currentIndex = index;
        carousel.dataset.current = index;

        // Update slides
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
            slide.style.transform = `translateX(${(i - index) * 100}%)`;
        });

        // Update dots
        dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });

        // Hide hint after first interaction
        if (hint && index > 0) {
            hint.style.opacity = '0';
        }
    }

    // Initialize slide positions
    slides.forEach((slide, i) => {
        slide.style.transform = `translateX(${i * 100}%)`;
    });

    // Touch events
    track.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
    }, { passive: true });

    track.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;

        const endX = e.changedTouches[0].clientX;
        const diff = startX - endX;

        if (Math.abs(diff) > 50) { // Minimum swipe distance
            if (diff > 0) {
                goToSlide(currentIndex + 1); // Swipe left - next
            } else {
                goToSlide(currentIndex - 1); // Swipe right - prev
            }
        }
    }, { passive: true });

    // Mouse events for desktop
    track.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        isDragging = true;
        track.style.cursor = 'grabbing';
    });

    track.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        track.style.cursor = 'grab';

        const diff = startX - e.clientX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) {
                goToSlide(currentIndex + 1);
            } else {
                goToSlide(currentIndex - 1);
            }
        }
    });

    track.addEventListener('mouseleave', () => {
        isDragging = false;
        track.style.cursor = 'grab';
    });

    // Dot clicks
    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            goToSlide(parseInt(dot.dataset.index));
        });
    });

    // Keyboard navigation (left/right arrows)
    const keyHandler = (e) => {
        const feedbackModal = document.getElementById('feedback-modal');
        if (feedbackModal?.classList.contains('hidden')) return;

        if (e.key === 'ArrowLeft') {
            goToSlide(currentIndex - 1);
        } else if (e.key === 'ArrowRight') {
            goToSlide(currentIndex + 1);
        }
    };

    document.addEventListener('keydown', keyHandler);

    // Cleanup on modal close (store reference for removal)
    carousel._keyHandler = keyHandler;
}

export function startQuiz() {
    console.log('[Debug] startQuiz called');
    const questions = selectQuestionsForSession();
    console.log('[Debug] Questions selected:', questions ? questions.length : 0);

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

    // Scroll to top to ensure quiz is visible
    window.scrollTo(0, 0);

    // Update counters
    const currentQEl = document.getElementById('current-question');
    const totalQEl = document.getElementById('total-quiz-questions');
    console.log('[Debug] Counter Elements:', { currentQEl, totalQEl });

    if (currentQEl) currentQEl.textContent = '1';
    if (totalQEl) totalQEl.textContent = questions.length;

    // Hide Quit Button for Shared Quiz to prevent accidental exit
    const quitBtn = document.getElementById('quit-btn');
    if (appState.currentMaterial?.isPublicSource) {
        if (quitBtn) quitBtn.style.display = 'none';
    } else {
        if (quitBtn) quitBtn.style.display = 'flex';
    }

    // Report Button Logic (Show only for Public Library content)
    const reportBtn = document.getElementById('report-quiz-btn');
    const currentMaterial = appState.materials.find(m => m.id === appState.currentMaterialId);

    console.log('[Debug] startQuiz - Report Button Check:', {
        exists: !!reportBtn,
        material: currentMaterial,
        materialId: appState.currentMaterialId,
        isPublic: currentMaterial?.isPublicSource
    });

    if (reportBtn) {
        if (currentMaterial && currentMaterial.isPublicSource) {
            reportBtn.classList.remove('hidden');
            // Remove old listeners to prevent duplicates
            const newReportBtn = reportBtn.cloneNode(true);
            reportBtn.parentNode.replaceChild(newReportBtn, reportBtn);

            // Import openReportModal dynamically or assume it's global? 
            // It's in library.js. We might need to export it or attach to window.
            // BUT game.js does not import library.js (circular dependency risk).
            // Best bet: Dispatch custom event or use window.
            newReportBtn.addEventListener('click', () => {
                // material.id is what we need.
                // call global function?
                if (window.openReportModal) {
                    window.openReportModal(currentMaterial.id, currentMaterial.title);
                } else {
                    console.warn('openReportModal not found');
                }
            });
        } else {
            reportBtn.classList.add('hidden');
        }
    }

    displayQuestion();
}

// Helper to shuffle array (Fisher-Yates)
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function displayQuestion() {
    console.log('[Debug] displayQuestion called. Index:', appState.currentQuestionIndex);
    const q = appState.currentQuiz[appState.currentQuestionIndex];
    if (!q) {
        console.error('[Debug] No question found at index!');
        return;
    }

    // Force repair if index is invalid (Double Safety for Single Question)
    if (q.correctIndex === -1 || q.correctIndex === undefined) {
        console.warn('[Debug] repairing single question index on fly', q);
        if (q.choices && q.correctAnswer) {
            q.correctIndex = q.choices.findIndex(c => c.trim() === q.correctAnswer.trim());
        }
        if (q.correctIndex === -1) q.correctIndex = 0; // Final Fallback
    }

    const textEl = document.getElementById('question-text');
    const numEl = document.getElementById('current-question'); // Using current-question ID as per recent fix

    if (textEl) textEl.textContent = q.question;
    if (numEl) numEl.textContent = appState.currentQuestionIndex + 1;

    // Badge (v3: supports basic/intermediate/advanced)
    const badge = document.getElementById('difficulty-badge');
    if (badge) {
        const diff = q.difficulty || 'basic';
        badge.className = `difficulty-badge ${diff}`;
        const labels = { basic: '🌱 基本', intermediate: '🌿 標準', advanced: '🌳 応用' };
        badge.textContent = labels[diff] || labels.basic;
    }

    // Choices (Randomized)
    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    // Create array of objects to track original index
    const choiceObjects = q.choices.map((text, idx) => ({ text, originalIndex: idx }));
    // Shuffle for display
    shuffle(choiceObjects);

    choiceObjects.forEach((item, displayIdx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'choice-wrapper';
        wrapper.innerHTML = `
            <span class="choice-number">${displayIdx + 1}</span>
            <button class="choice-btn" data-original-index="${item.originalIndex}">${item.text}</button>
        `;
        container.appendChild(wrapper);

        // Pass original index for logic correctness
        wrapper.querySelector('button').onclick = () => handleAnswer(item.originalIndex);
    });

    updateProgressGridUI();

    // Image
    const imgContainer = document.getElementById('question-image-container');
    const img = document.getElementById('question-image');

    // Reset
    imgContainer.style.backgroundImage = 'none';
    imgContainer.classList.remove('grid-mode');
    img.style.display = 'none';
    imgContainer.style.display = 'none';

    if (q.imageUrl && q.imageGridIndex !== undefined) {
        // Grid View
        imgContainer.style.display = 'block';
        imgContainer.classList.add('grid-mode');
        imgContainer.style.backgroundImage = `url(${q.imageUrl})`;

        const col = q.imageGridIndex % 4;
        const row = Math.floor(q.imageGridIndex / 4);
        const xPos = (col / 3) * 100;
        const yPos = (row / 2) * 100;

        imgContainer.style.backgroundPosition = `${xPos}% ${yPos}%`;
        imgContainer.style.backgroundSize = '400% 300%'; // STRICT 4:3 Fit (No Zoom)

    } else if (q.imageUrl) {
        // Standard Image
        img.src = q.imageUrl;
        img.style.display = 'block';
        imgContainer.style.display = 'block';
    }
}

function handleAnswer(originalSelectedIndex) {
    if (appState.selectedAnswer !== null) return;
    appState.selectedAnswer = originalSelectedIndex;

    const q = appState.currentQuiz[appState.currentQuestionIndex];
    const isCorrect = originalSelectedIndex === Number(q.correctIndex);

    // UI Update - Find button by original index
    const buttons = document.querySelectorAll('.choice-btn');
    buttons.forEach((btn) => {
        btn.disabled = true;
        const btnOriginalIdx = parseInt(btn.dataset.originalIndex);

        if (btnOriginalIdx === q.correctIndex) {
            btn.classList.add('correct');
        } else if (btnOriginalIdx === originalSelectedIndex && !isCorrect) {
            btn.classList.add('incorrect');
        }
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
    appState.userStats.streak = calculateStreak();

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

    const correctAnswer = q.choices[q.correctIndex];
    const explanationEl = document.getElementById('feedback-explanation');

    // Build carousel slides
    const slides = [];

    // Slide 1: Correct Answer (always shown)
    slides.push({
        icon: '✓',
        title: '正解',
        content: correctAnswer,
        color: '#10b981',
        bgColor: 'rgba(16, 185, 129, 0.15)'
    });

    // v3 structured explanation
    if (q.explanation && typeof q.explanation === 'object') {
        const { hook, core, application } = q.explanation;
        if (hook) {
            slides.push({
                icon: '💡',
                title: 'ポイント',
                content: hook,
                color: '#fbbf24',
                bgColor: 'rgba(251, 191, 36, 0.1)'
            });
        }
        if (core) {
            slides.push({
                icon: '📖',
                title: '解説',
                content: core,
                color: '#60a5fa',
                bgColor: 'rgba(96, 165, 250, 0.1)'
            });
        }
        if (application) {
            slides.push({
                icon: '🚀',
                title: '応用',
                content: application,
                color: '#a78bfa',
                bgColor: 'rgba(167, 139, 250, 0.1)'
            });
        }
    } else if (q.explanation) {
        // Legacy string format - single slide
        slides.push({
            icon: '📖',
            title: '解説',
            content: q.explanation,
            color: '#60a5fa',
            bgColor: 'rgba(96, 165, 250, 0.1)'
        });
    }

    // Misconception slide (v3)
    if (q.misconception) {
        slides.push({
            icon: '⚠️',
            title: 'よくある間違い',
            content: q.misconception,
            color: '#f87171',
            bgColor: 'rgba(248, 113, 113, 0.1)'
        });
    }

    // Build carousel HTML (compact version - no backgrounds or borders)
    const slidesHTML = slides.map((slide, i) => `
        <div class="explanation-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
            <div class="slide-header-compact" style="color: ${slide.color};">
                <span>${slide.icon}</span>
                <span class="slide-title-compact">${slide.title}</span>
                <span class="slide-counter-compact">${i + 1}/${slides.length}</span>
            </div>
            <div class="slide-content-compact">${slide.content}</div>
        </div>
    `).join('');

    const dotsHTML = slides.length > 1 ? `
        <div class="carousel-dots-compact">
            ${slides.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('')}
        </div>
    ` : '';

    explanationEl.innerHTML = `
        <div class="explanation-carousel" data-current="0" data-total="${slides.length}">
            <div class="carousel-track">
                ${slidesHTML}
            </div>
            ${dotsHTML}
        </div>
    `;

    // Setup carousel interaction
    if (slides.length > 1) {
        setupCarouselInteraction(explanationEl.querySelector('.explanation-carousel'));
    }

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

// --- Keyboard Shortcuts ---
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only active if quiz screen is visible
        const quizScreen = document.getElementById('quiz-screen');
        if (!quizScreen || !quizScreen.classList.contains('active')) return;

        // Ignore if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // 1. Next Question (Space / Enter)
        // Check if feedback modal is open
        const feedbackModal = document.getElementById('feedback-modal');
        const isFeedbackOpen = feedbackModal && !feedbackModal.classList.contains('hidden');

        if (isFeedbackOpen) {
            if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault(); // Prevent scrolling
                const nextBtn = document.getElementById('next-question-btn');
                if (nextBtn) nextBtn.click();
            }
            return; // Don't allow answering while feedback is open
        }

        // 2. Answer Selection (Numbers 1-9)
        if (appState.selectedAnswer === null) { // Only if not yet answered
            const num = parseInt(e.key);
            if (!isNaN(num) && num >= 1 && num <= 9) {
                // Convert 1-based key to 0-based visual index
                const visualIndex = num - 1;
                const choices = document.querySelectorAll('.choice-btn');

                if (visualIndex < choices.length) {
                    const targetBtn = choices[visualIndex];
                    // IMPORTANT: Get the ORIGINAL index from the shuffled button
                    const originalIndex = parseInt(targetBtn.dataset.originalIndex);

                    // Trigger click to ensure visual feedback + logic both run
                    // Or call logic directly: handleAnswer(originalIndex);
                    // But click() is safer as it might have other listeners/effects
                    targetBtn.click();
                }
            }
        }
    });
}

// Initialize Global Listener
setupKeyboardShortcuts();

// Expose to global for api.js integration
window.startQuizWithMaterial = (materialId) => {
    console.log('[Debug] window.startQuizWithMaterial called with:', materialId);
    appState.currentMaterialId = materialId;
    appState.selectedMaterial = materialId;
    startQuiz();
};

window.setupKeyboardShortcuts = setupKeyboardShortcuts;
