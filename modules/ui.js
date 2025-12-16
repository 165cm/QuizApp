import { appState } from './state.js';
import { getReviewDueCount } from './quiz.js';
import { renderInterestsChart, renderWeakPoints } from './stats.js';

// Mini carousel interaction for review explanations
function setupMiniCarousel(carousel) {
    if (!carousel) return;

    const track = carousel.querySelector('.carousel-track');
    const slides = carousel.querySelectorAll('.explanation-slide');
    const dots = carousel.querySelectorAll('.carousel-dot');
    let currentIndex = 0;
    let startX = 0;

    function goToSlide(index) {
        if (index < 0) index = 0;
        if (index >= slides.length) index = slides.length - 1;
        currentIndex = index;

        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === index);
            slide.style.transform = `translateX(${(i - index) * 100}%)`;
        });
        dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
    }

    // Initialize positions
    slides.forEach((slide, i) => slide.style.transform = `translateX(${i * 100}%)`);

    // Touch events
    track.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener('touchend', (e) => {
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) goToSlide(diff > 0 ? currentIndex + 1 : currentIndex - 1);
    }, { passive: true });

    // Click on dots
    dots.forEach(dot => dot.addEventListener('click', () => goToSlide(parseInt(dot.dataset.index))));
}

export function showScreen(screenId) {
    console.log(`[Debug] showScreen called for: ${screenId}`);
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden'); // Ensure hidden is added back
        screen.style.display = 'none';
    });
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.remove('hidden'); // Explicitly remove hidden
        screen.style.display = 'block';
        // Force reflow for animation
        void screen.offsetWidth;
        screen.classList.add('active');
        console.log(`[Debug] Screen ${screenId} made active.`);
    } else {
        console.error(`[Debug] Screen element not found: ${screenId}`);
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

    // v3: Review Reminder Banner
    const reminderBanner = document.getElementById('review-reminder-banner');
    if (reminderBanner) {
        if (reviewCount > 0) {
            reminderBanner.style.display = 'block';
            const titleEl = document.getElementById('review-reminder-title');
            const descEl = document.getElementById('review-reminder-desc');
            if (titleEl) titleEl.textContent = `${reviewCount}問の復習待ち！`;
            if (descEl) descEl.textContent = '忘れかけた頃がベストタイミング';
        } else {
            reminderBanner.style.display = 'none';
        }
    }

    // v3: Learning Tip (rotate based on day/stats)
    const tipEl = document.getElementById('learning-tip-text');
    if (tipEl) {
        const tips = [
            '忘れかけた頃に復習すると、記憶が強化されます',
            '間違えた問題は「惜しかった！」と思うほど記憶に残ります',
            '10秒のぼーっとタイムが脳の整理を助けます',
            '「なぜ？」を考えながら解くと理解が深まります',
            '1日後→3日後→7日後と間隔を空けると効果的です'
        ];
        const dayIndex = new Date().getDate() % tips.length;
        tipEl.textContent = tips[dayIndex];
    }
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

    // Sort by recent (and exclude deleted)
    const materials = appState.materials
        .filter(m => !m.deleted_at)
        .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
        .slice(0, 10);

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

// Progress status update
export function updateGeneratingStatus(message, progressPercent = 0) {
    const statusText = document.getElementById('loading-status-text');
    if (statusText) statusText.textContent = message;

    const bar = document.getElementById('progress-fill');
    if (bar) {
        bar.style.width = `${progressPercent}%`;
    }
}

// Mini Review Logic
let miniReviewInterval = null;
let quizReadyCallback = null; // Callback to show preview when user is ready
let miniKeyboardHandler = null; // Keyboard handler reference

export function startMiniReview() {
    quizReadyCallback = null; // Reset state
    const container = document.getElementById('mini-review-container');
    if (!container) return;

    // Show container
    container.classList.remove('hidden');

    // Attach Keyboard Listener for mini review
    if (!miniKeyboardHandler) {
        miniKeyboardHandler = (e) => {
            // Ignore if typing in an input
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

            const floating = document.getElementById('mini-review-floating');
            if (!floating) return;

            // Numbers 1-9 for answer selection
            if (e.key >= '1' && e.key <= '9') {
                const idx = parseInt(e.key) - 1;
                const btn = floating.querySelector(`.mini-choice-btn[data-index="${idx}"]`);
                if (btn) btn.click();
            }
            // Space for Next Question
            if (e.code === 'Space') {
                const nextBtn = document.getElementById('mini-next-btn');
                if (nextBtn && nextBtn.style.display !== 'none') {
                    e.preventDefault(); // Prevent scrolling
                    nextBtn.click();
                }
            }
        };
        window.addEventListener('keydown', miniKeyboardHandler);
    }

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
        let notification = document.getElementById('quiz-ready-banner');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'quiz-ready-banner';
            // Insert at top
            floatingContainer.insertBefore(notification, floatingContainer.firstChild);
        }

        notification.style.cssText = `
            background: linear-gradient(135deg, #10b981, #059669);
            padding: 0.75rem;
            border-radius: 10px;
            text-align: center;
            margin-bottom: 1rem;
            color: white;
            font-weight: bold;
            cursor: pointer;
            animation: pulse-green 1.5s infinite;
            border: 2px solid #fff;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        `;
        notification.innerHTML = '✨ 生成完了！ここをクリックして開始 ✨';

        notification.onclick = () => {
            stopMiniReview();
            callback();
        };
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

    // Remove Keyboard Listener
    if (typeof miniKeyboardHandler !== 'undefined' && miniKeyboardHandler) {
        window.removeEventListener('keydown', miniKeyboardHandler);
        miniKeyboardHandler = null;
    }
}

function renderNextMiniQuestion() {
    // Create or get the floating container
    let floatingContainer = document.getElementById('mini-review-floating');
    if (!floatingContainer) {
        floatingContainer = document.createElement('div');
        floatingContainer.id = 'mini-review-floating';
        floatingContainer.id = 'mini-review-floating';
        // Styles moved to CSS (#mini-review-floating)
        document.body.appendChild(floatingContainer);
    }

    // Pick random question (Fallback to default if empty)
    let q;
    if (appState.questions && appState.questions.length > 0) {
        q = appState.questions[Math.floor(Math.random() * appState.questions.length)];
    } else {
        // Default questions for guest users
        const defaults = [
            { text: "クイズアプリへようこそ！このアプリの主な機能は何でしょう？", choices: ["学習", "料理", "睡眠"], correct_answer: "学習", explanation: "AIを使って自分だけのクイズを作れます。" },
            { text: "問題の正解数を増やすと、リザルト画面で何がもらえますか？", choices: ["バッジ", "現金", "筋肉"], correct_answer: "バッジ", explanation: "正解率に応じて豪華なバッジが表示されます。" },
            { text: "「みんなの広場」では何ができますか？", choices: ["クイズの共有", "チャット", "買い物"], correct_answer: "クイズの共有", explanation: "他のユーザーが作ったクイズを遊ぶことができます。" }
        ];
        q = defaults[Math.floor(Math.random() * defaults.length)];
    }

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

    // Render Question (Simplified)
    floatingContainer.innerHTML = `
        <div style="color: #94a3b8; font-size: 0.8rem; margin-bottom: 0.5rem; text-align: center;">復習クイズ <span style="font-size:0.75em; opacity:0.7">(キーボード: 1-4, Space)</span></div>
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
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                ">
                    <span style="
                        background: rgba(255,255,255,0.1); 
                        width: 24px; height: 24px; 
                        display: flex; align-items: center; justify-content: center; 
                        border-radius: 50%; font-weight: bold; font-size: 0.8em;
                        flex-shrink: 0;
                    ">${i + 1}</span>
                    <span>${c}</span>
                </button>
            `).join('') : '<p style="color: #ef4444;">選択肢が見つかりません</p>'}
        </div>
        <div id="mini-feedback" style="display: none; margin-top: 1rem; padding: 0.75rem; border-radius: 8px; text-align: center; font-weight: 600;"></div>
        <div id="mini-explanation" style="display: none; margin-top: 0.75rem; padding: 0.75rem; background: rgba(99, 102, 241, 0.1); border-radius: 8px; color: #a5b4fc; font-size: 0.9rem;"></div>
        <button id="mini-next-btn" style="display: none; margin-top: 1rem; width: 100%; padding: 0.75rem; background: #6366f1; border: none; border-radius: 10px; color: white; font-size: 0.9rem; cursor: pointer;">次の問題へ (Space) ➡</button>
`;

    // Add Listeners
    floatingContainer.querySelectorAll('.mini-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // ... existing click logic ...
            handleMiniAnswer(btn, q, correctIdx);
        });
    });

    // Next Button
    const nextBtn = document.getElementById('mini-next-btn');
    if (nextBtn) {
        nextBtn.onclick = () => renderNextMiniQuestion();
    }
}

function handleMiniAnswer(btn, q, correctIdx) {
    const parent = document.getElementById('mini-choices');
    if (!parent || parent.classList.contains('answered')) return;
    parent.classList.add('answered');

    const selectedIdx = parseInt(btn.dataset.index);
    const feedback = document.getElementById('mini-feedback');
    const explanation = document.getElementById('mini-explanation');
    const nextBtn = document.getElementById('mini-next-btn');

    const isCorrect = (selectedIdx === correctIdx);

    // Visuals: Dim all first
    parent.querySelectorAll('.mini-choice-btn').forEach(b => {
        b.style.pointerEvents = 'none';
        b.style.opacity = '0.7';
    });

    // Highlight selected
    btn.style.opacity = '1';
    btn.style.background = isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    btn.style.borderColor = isCorrect ? '#10b981' : '#ef4444';

    // Show correct if wrong
    if (!isCorrect && correctIdx !== undefined) {
        const correctBtn = parent.querySelector(`.mini-choice-btn[data-index="${correctIdx}"]`);
        if (correctBtn) {
            correctBtn.style.opacity = '1';
            correctBtn.style.borderColor = '#10b981';
            correctBtn.style.background = 'rgba(16, 185, 129, 0.3)';
        }
    }

    if (feedback) {
        feedback.style.display = 'block';
        feedback.textContent = isCorrect ? '✨ 正解!' : '不正解...';
        feedback.style.background = isCorrect ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        feedback.style.color = isCorrect ? '#6ee7b7' : '#fca5a5';
    }

    if (explanation && q.explanation) {
        explanation.style.display = 'block';

        // v3: Parse explanation if it's a JSON string
        let exp = q.explanation;
        if (typeof exp === 'string' && exp.startsWith('{')) {
            try {
                exp = JSON.parse(exp);
            } catch (e) {
                // Keep as string if parse fails
            }
        }

        // Build mini carousel slides
        const slides = [];
        const correctAnswer = q.choices ? q.choices[q.correctIndex] : '';

        // Slide 1: Correct Answer
        if (correctAnswer) {
            slides.push({ icon: '✓', title: '正解', content: correctAnswer, color: '#10b981' });
        }

        // v3: handle object format with hook/core/application
        if (typeof exp === 'object' && exp.hook) {
            const { hook, core, application } = exp;
            if (hook) slides.push({ icon: '💡', title: 'ポイント', content: hook, color: '#fbbf24' });
            if (core) slides.push({ icon: '📖', title: '解説', content: core, color: '#60a5fa' });
            if (application) slides.push({ icon: '🚀', title: '応用', content: application, color: '#a78bfa' });
        } else if (typeof exp === 'string' && exp) {
            slides.push({ icon: '📖', title: '解説', content: exp, color: '#60a5fa' });
        }

        // Misconception slide
        if (q.misconception) {
            slides.push({ icon: '⚠️', title: 'よくある間違い', content: q.misconception, color: '#f87171' });
        }

        // Build carousel HTML
        if (slides.length > 0) {
            const slidesHTML = slides.map((s, i) => `
                <div class="explanation-slide ${i === 0 ? 'active' : ''}" data-index="${i}">
                    <div class="slide-header-compact" style="color: ${s.color};">
                        <span>${s.icon}</span>
                        <span class="slide-title-compact">${s.title}</span>
                        <span class="slide-counter-compact">${i + 1}/${slides.length}</span>
                    </div>
                    <div class="slide-content-compact">${s.content}</div>
                </div>
            `).join('');

            const dotsHTML = slides.length > 1 ? `
                <div class="carousel-dots-compact">
                    ${slides.map((_, i) => `<span class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('')}
                </div>
            ` : '';

            explanation.innerHTML = `
                <div class="explanation-carousel" data-current="0" data-total="${slides.length}">
                    <div class="carousel-track">${slidesHTML}</div>
                    ${dotsHTML}
                </div>
            `;

            // Setup mini carousel interaction
            if (slides.length > 1) {
                setupMiniCarousel(explanation.querySelector('.explanation-carousel'));
            }
        } else {
            explanation.textContent = '';
        }
    }

    // User requested "Keyboard" so manual "Enter" is better.
    if (nextBtn) nextBtn.style.display = 'block';
}

// --- Generation Complete Modal ---
export function showGenerationCompleteModal(material) {
    // Remove existing if any
    const existing = document.getElementById('gen-complete-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'gen-complete-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex; justify-content: center; align-items: center;
        z-index: 10000;
        opacity: 0; transition: opacity 0.3s;
    `;

    modal.innerHTML = `
        <div style="background: var(--card-bg); padding: 2rem; border-radius: 16px; width: 90%; max-width: 400px; text-align: center; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
            <h2 style="font-size: 1.5rem; font-weight: 700; color: white; margin-bottom: 0.5rem;">生成完了！</h2>
            <p style="color: var(--text-muted); margin-bottom: 1.5rem; font-size: 0.95rem;">
                「${material.title}」<br>のクイズが完成しました。
            </p>
            
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                <button id="gen-play-btn" style="
                    background: linear-gradient(135deg, #6366f1, #4f46e5);
                    color: white; border: none; padding: 0.8rem; border-radius: 12px;
                    font-weight: 600; font-size: 1rem; cursor: pointer;
                    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                ">▶ 今すぐプレイ</button>
                
                <button id="gen-close-btn" style="
                    background: transparent; border: 1px solid rgba(255,255,255,0.2);
                    color: var(--text-muted); padding: 0.8rem; border-radius: 12px;
                    font-size: 0.9rem; cursor: pointer;
                ">閉じる</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Animation
    requestAnimationFrame(() => modal.style.opacity = '1');

    console.log('[Debug] showGenerationCompleteModal - Modal created');

    // Events
    const playBtn = document.getElementById('gen-play-btn');
    console.log('[Debug] gen-play-btn element:', playBtn);

    if (playBtn) {
        playBtn.onclick = () => {
            console.log('[Debug] gen-play-btn clicked! Material ID:', material.id);
            modal.remove();
            stopMiniReview();
            // Use global exposed wrapper
            if (window.startQuizWithMaterial) {
                console.log('[Debug] Calling startQuizWithMaterial');
                window.startQuizWithMaterial(material.id);
            } else {
                console.error('[Debug] startQuizWithMaterial NOT FOUND on window!');
                alert('startQuizWithMaterial が見つかりません。リロードしてください。');
            }
        };
    } else {
        console.error('[Debug] gen-play-btn NOT FOUND!');
    }

    document.getElementById('gen-close-btn').onclick = () => {
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
            stopMiniReview();
            showScreen('home-screen');
        }, 300);
    };
}
