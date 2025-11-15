// ========================================
// グローバル変数
// ========================================
let appState = {
    apiKey: localStorage.getItem('openai_api_key') || '',
    questions: JSON.parse(localStorage.getItem('questions') || '[]'),
    userStats: JSON.parse(localStorage.getItem('user_stats') || JSON.stringify({
        totalAnswered: 0,
        correctAnswers: 0,
        lastStudyDate: null,
        streak: 0
    })),
    currentQuiz: [],
    currentQuestionIndex: 0,
    currentSession: {
        correct: 0,
        total: 0
    },
    selectedAnswer: null
};

// ========================================
// 画面管理
// ========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

// ========================================
// ホーム画面の初期化
// ========================================
function initHomeScreen() {
    updateStats();
    updateStartButton();
}

function updateStats() {
    const stats = appState.userStats;
    const reviewCount = getReviewDueCount();

    // ストリーク更新
    updateStreak();
    document.getElementById('streak-count').textContent = stats.streak;

    // 統計表示
    document.getElementById('total-questions').textContent = appState.questions.length;

    const accuracy = stats.totalAnswered > 0
        ? Math.round((stats.correctAnswers / stats.totalAnswered) * 100)
        : 0;
    document.getElementById('accuracy-rate').textContent = accuracy + '%';
    document.getElementById('review-count').textContent = reviewCount;
}

function updateStreak() {
    const today = new Date().toDateString();
    const lastStudy = appState.userStats.lastStudyDate;

    if (!lastStudy) {
        return;
    }

    const lastDate = new Date(lastStudy);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // 今日既に勉強した場合は何もしない
    if (lastDate.toDateString() === today) {
        return;
    }

    // 昨日勉強していなかった場合はストリークリセット
    if (lastDate.toDateString() !== yesterday.toDateString()) {
        appState.userStats.streak = 0;
        saveUserStats();
    }
}

function updateStartButton() {
    const btn = document.getElementById('start-quiz-btn');
    const todayQuizCount = getTodayQuizCount();

    if (appState.questions.length === 0) {
        btn.disabled = true;
        btn.textContent = 'まずクイズを生成してください';
    } else {
        btn.disabled = false;
        document.getElementById('today-quiz-count').textContent = `(${todayQuizCount}問)`;
    }
}

function getTodayQuizCount() {
    const reviewDue = getReviewDueCount();
    const newQuestions = appState.questions.filter(q => !q.lastReviewed).length;
    return Math.min(10, reviewDue + Math.min(5, newQuestions));
}

// ========================================
// PDF処理
// ========================================
document.getElementById('pdf-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        document.getElementById('file-name').textContent = file.name;
        document.getElementById('generate-btn').disabled = false;
    }
});

document.getElementById('generate-btn').addEventListener('click', async function() {
    const fileInput = document.getElementById('pdf-input');
    const file = fileInput.files[0];

    if (!file) {
        alert('PDFファイルを選択してください');
        return;
    }

    // APIキーの確認
    if (!appState.apiKey) {
        showApiKeyModal();
        return;
    }

    await generateQuiz(file);
});

async function generateQuiz(file) {
    showScreen('generating-screen');

    try {
        // PDFテキスト抽出
        updateGeneratingStatus('PDFを読み込んでいます...', 20);
        const text = await extractTextFromPDF(file);

        if (!text || text.trim().length < 100) {
            throw new Error('PDFからテキストを抽出できませんでした');
        }

        // クイズ生成
        updateGeneratingStatus('AIがクイズを生成中...', 50);
        const questions = await generateQuestionsWithAI(text, file.name);

        // 保存
        updateGeneratingStatus('保存しています...', 90);
        appState.questions = [...appState.questions, ...questions];
        saveQuestions();

        updateGeneratingStatus('完了!', 100);

        setTimeout(() => {
            showScreen('home-screen');
            initHomeScreen();
            alert(`${questions.length}問のクイズを生成しました!`);
        }, 500);

    } catch (error) {
        console.error('クイズ生成エラー:', error);
        alert('クイズの生成に失敗しました: ' + error.message);
        showScreen('home-screen');
    }
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';

    const maxPages = Math.min(pdf.numPages, 300); // 最大300ページ

    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';

        // 進捗更新
        const progress = Math.round((i / maxPages) * 20);
        updateGeneratingStatus(`PDFを読み込んでいます... (${i}/${maxPages}ページ)`, progress);
    }

    return fullText;
}

async function generateQuestionsWithAI(text, fileName) {
    const maxChars = 12000; // GPT-4o-miniのトークン制限を考慮
    const truncatedText = text.slice(0, maxChars);

    const prompt = `以下のテキストから30問の4択クイズを生成してください。

要件:
1. まずテキストを分析して、主要な見出し（セクション、章、トピック）を検出してください
2. 各見出しセクションから問題を生成し、各問題に対応する見出しを記録してください
3. 各問題は基礎(10問)、標準(10問)、応用(10問)の3つの難易度に分類
4. 選択肢には「よくある誤解」を含める(実は間違えた効果)
5. JSON形式で出力
6. 日本語で出力

出力形式:
{
  "sections": [
    {
      "heading": "見出し1",
      "level": 1
    },
    {
      "heading": "見出し2",
      "level": 1
    }
  ],
  "questions": [
    {
      "question": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctIndex": 0,
      "explanation": "解説文",
      "difficulty": "basic",
      "sourceSection": "見出し1"
    }
  ]
}

注意:
- sourceSectionは必ず上記sectionsの中のheadingのいずれかと一致すること
- 見出しが明確でない場合は、テキストの内容から適切なトピック名を作成してください
- すべての問題に必ずsourceSectionを含めてください

テキスト:
${truncatedText}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'あなたは教育用クイズ作成の専門家です。与えられたテキストから質の高い学習用クイズを生成し、各問題の参照元セクションを明確に記録します。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.7,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API呼び出しに失敗しました');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // JSONパース
    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        console.error('JSON parse error:', e);
        throw new Error('生成されたクイズの形式が不正です');
    }

    // sectionsとquestionsを取得
    const sections = parsed.sections || [];
    const questions = parsed.questions || [];

    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('クイズが生成されませんでした');
    }

    // 参照元情報を作成
    const referenceId = 'ref_' + Date.now();
    const uploadDate = new Date().toISOString();

    // 見出し情報をlocalStorageに保存（参照元IDをキーとして）
    const sectionsKey = `sections_${referenceId}`;
    localStorage.setItem(sectionsKey, JSON.stringify(sections));

    // 間隔反復用のデータと参照元情報を追加
    return questions.map(q => ({
        ...q,
        id: Date.now() + Math.random(),
        lastReviewed: null,
        reviewCount: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReview: null,
        reference: {
            id: referenceId,
            fileName: fileName,
            uploadDate: uploadDate,
            section: q.sourceSection || '不明'
        }
    }));
}

function updateGeneratingStatus(message, progress) {
    document.getElementById('generating-status').textContent = message;
    document.getElementById('progress-fill').style.width = progress + '%';
}

// ========================================
// クイズセッション
// ========================================
document.getElementById('start-quiz-btn').addEventListener('click', startQuiz);

function startQuiz() {
    // 今日のクイズを選択
    appState.currentQuiz = selectTodayQuestions();
    appState.currentQuestionIndex = 0;
    appState.currentSession = { correct: 0, total: 0 };

    if (appState.currentQuiz.length === 0) {
        alert('出題する問題がありません');
        return;
    }

    showScreen('quiz-screen');
    displayQuestion();
}

function selectTodayQuestions() {
    const reviewDue = appState.questions.filter(q => isReviewDue(q));
    const newQuestions = appState.questions.filter(q => !q.lastReviewed);

    // 適応型難易度選択
    const userLevel = calculateUserLevel();
    let selected = [];

    // 復習問題を優先
    selected = [...reviewDue.slice(0, 5)];

    // 残りを新規問題から難易度に応じて選択
    const remaining = 10 - selected.length;
    if (remaining > 0) {
        const filteredNew = filterByDifficulty(newQuestions, userLevel);
        selected = [...selected, ...shuffleArray(filteredNew).slice(0, remaining)];
    }

    return shuffleArray(selected);
}

function calculateUserLevel() {
    const stats = appState.userStats;
    if (stats.totalAnswered < 10) return 'basic';

    const accuracy = stats.correctAnswers / stats.totalAnswered;
    if (accuracy >= 0.8) return 'advanced';
    if (accuracy >= 0.6) return 'standard';
    return 'basic';
}

function filterByDifficulty(questions, userLevel) {
    const weights = {
        'basic': { basic: 0.7, standard: 0.2, advanced: 0.1 },
        'standard': { basic: 0.2, standard: 0.6, advanced: 0.2 },
        'advanced': { basic: 0.1, standard: 0.3, advanced: 0.6 }
    };

    const w = weights[userLevel];
    const byDifficulty = {
        basic: questions.filter(q => q.difficulty === 'basic'),
        standard: questions.filter(q => q.difficulty === 'standard'),
        advanced: questions.filter(q => q.difficulty === 'advanced')
    };

    const selected = [
        ...byDifficulty.basic.slice(0, Math.floor(10 * w.basic)),
        ...byDifficulty.standard.slice(0, Math.floor(10 * w.standard)),
        ...byDifficulty.advanced.slice(0, Math.floor(10 * w.advanced))
    ];

    return selected;
}

function isReviewDue(question) {
    if (!question.nextReview) return false;
    return new Date(question.nextReview) <= new Date();
}

function getReviewDueCount() {
    return appState.questions.filter(q => isReviewDue(q)).length;
}

function displayQuestion() {
    const question = appState.currentQuiz[appState.currentQuestionIndex];

    // プログレス更新
    document.getElementById('current-question').textContent = appState.currentQuestionIndex + 1;
    document.getElementById('total-quiz-questions').textContent = appState.currentQuiz.length;
    const progress = ((appState.currentQuestionIndex + 1) / appState.currentQuiz.length) * 100;
    document.getElementById('quiz-progress').style.width = progress + '%';

    // 難易度バッジ
    const badge = document.getElementById('difficulty-badge');
    const difficultyLabels = {
        'basic': '基礎',
        'standard': '標準',
        'advanced': '応用'
    };
    badge.textContent = difficultyLabels[question.difficulty] || '基礎';
    badge.className = 'difficulty-badge ' + question.difficulty;

    // 質問表示
    document.getElementById('question-text').textContent = question.question;

    // 選択肢表示
    const container = document.getElementById('choices-container');
    container.innerHTML = '';
    question.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = choice;
        btn.onclick = () => selectChoice(index);
        container.appendChild(btn);
    });

    // リセット
    appState.selectedAnswer = null;
    document.getElementById('check-answer-btn').disabled = true;
    document.getElementById('feedback').classList.add('hidden');
}

function selectChoice(index) {
    // 既に回答済みなら無視
    if (appState.selectedAnswer !== null) return;

    appState.selectedAnswer = index;

    // UI更新
    const choices = document.querySelectorAll('.choice-btn');
    choices.forEach((btn, i) => {
        btn.classList.remove('selected');
        if (i === index) {
            btn.classList.add('selected');
        }
    });

    document.getElementById('check-answer-btn').disabled = false;
}

document.getElementById('check-answer-btn').addEventListener('click', checkAnswer);

function checkAnswer() {
    const question = appState.currentQuiz[appState.currentQuestionIndex];
    const isCorrect = appState.selectedAnswer === question.correctIndex;

    // 統計更新
    appState.currentSession.total++;
    if (isCorrect) {
        appState.currentSession.correct++;
    }

    // UI更新
    const choices = document.querySelectorAll('.choice-btn');
    choices.forEach((btn, i) => {
        btn.disabled = true;
        if (i === question.correctIndex) {
            btn.classList.add('correct');
        } else if (i === appState.selectedAnswer && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });

    // フィードバック表示
    const feedback = document.getElementById('feedback');
    const icon = document.getElementById('feedback-icon');
    const title = document.getElementById('feedback-title');
    const explanation = document.getElementById('feedback-explanation');

    if (isCorrect) {
        icon.textContent = '🎉';
        title.textContent = '正解!';
        title.style.color = '#10b981';
    } else {
        icon.textContent = '💡';
        title.textContent = '不正解';
        title.style.color = '#ef4444';
    }

    explanation.textContent = question.explanation;
    feedback.classList.remove('hidden');

    // 間隔反復アルゴリズム適用
    updateQuestionStats(question, isCorrect);

    // ボタン非表示
    document.getElementById('check-answer-btn').style.display = 'none';
}

document.getElementById('next-question-btn').addEventListener('click', nextQuestion);

function nextQuestion() {
    document.getElementById('check-answer-btn').style.display = 'block';

    if (appState.currentQuestionIndex < appState.currentQuiz.length - 1) {
        // 10秒休憩(3問ごと)
        if ((appState.currentQuestionIndex + 1) % 3 === 0) {
            showBreak(() => {
                appState.currentQuestionIndex++;
                displayQuestion();
            });
        } else {
            appState.currentQuestionIndex++;
            displayQuestion();
        }
    } else {
        // クイズ終了
        finishQuiz();
    }
}

function showBreak(callback) {
    const breakScreen = document.getElementById('break-screen');
    const timer = document.getElementById('break-timer');
    breakScreen.classList.remove('hidden');

    let seconds = 10;
    timer.textContent = seconds;

    const interval = setInterval(() => {
        seconds--;
        timer.textContent = seconds;

        if (seconds <= 0) {
            clearInterval(interval);
            breakScreen.classList.add('hidden');
            callback();
        }
    }, 1000);
}

function finishQuiz() {
    // ユーザー統計更新
    appState.userStats.totalAnswered += appState.currentSession.total;
    appState.userStats.correctAnswers += appState.currentSession.correct;

    // ストリーク更新
    const today = new Date().toDateString();
    const lastStudy = appState.userStats.lastStudyDate;

    if (!lastStudy || new Date(lastStudy).toDateString() !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (lastStudy && new Date(lastStudy).toDateString() === yesterday.toDateString()) {
            appState.userStats.streak++;
        } else {
            appState.userStats.streak = 1;
        }

        appState.userStats.lastStudyDate = new Date().toISOString();
    }

    saveUserStats();
    saveQuestions();

    // 結果画面表示
    showResultScreen();
}

function showResultScreen() {
    const { correct, total } = appState.currentSession;
    const accuracy = Math.round((correct / total) * 100);

    // アイコンとメッセージ
    let icon = '🎉';
    let title = '素晴らしい!';
    let message = '完璧です!';

    if (accuracy >= 80) {
        icon = '🎉';
        title = '素晴らしい!';
        message = 'この調子で続けましょう!';
    } else if (accuracy >= 60) {
        icon = '👍';
        title = 'いい感じ!';
        message = '着実に進歩しています!';
    } else {
        icon = '💪';
        title = '頑張りました!';
        message = '復習を続ければ必ず上達します!';
    }

    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-message').textContent = message;
    document.getElementById('correct-count').textContent = correct;
    document.getElementById('result-total').textContent = total;
    document.getElementById('result-accuracy').textContent = accuracy + '%';

    showScreen('result-screen');
}

// ========================================
// 間隔反復アルゴリズム (SM-2改良版)
// ========================================
function updateQuestionStats(question, isCorrect) {
    const originalQuestion = appState.questions.find(q => q.id === question.id);
    if (!originalQuestion) return;

    originalQuestion.lastReviewed = new Date().toISOString();
    originalQuestion.reviewCount++;

    if (isCorrect) {
        // 正解: 間隔を延ばす
        if (originalQuestion.interval === 0) {
            originalQuestion.interval = 1;
        } else {
            originalQuestion.interval = Math.round(originalQuestion.interval * originalQuestion.easeFactor);
        }

        // 難易度係数を調整
        originalQuestion.easeFactor = Math.max(1.3, originalQuestion.easeFactor + 0.1);
    } else {
        // 不正解: 間隔をリセット
        originalQuestion.interval = 0;
        originalQuestion.easeFactor = Math.max(1.3, originalQuestion.easeFactor - 0.2);
    }

    // 次の復習日を設定
    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + originalQuestion.interval);
    originalQuestion.nextReview = nextReviewDate.toISOString();
}

// ========================================
// データ管理
// ========================================
function saveQuestions() {
    localStorage.setItem('questions', JSON.stringify(appState.questions));
}

function saveUserStats() {
    localStorage.setItem('user_stats', JSON.stringify(appState.userStats));
}

// ========================================
// APIキーモーダル
// ========================================
function showApiKeyModal() {
    document.getElementById('api-key-modal').classList.remove('hidden');
    document.getElementById('api-key-input').value = appState.apiKey;
}

document.getElementById('cancel-api-key').addEventListener('click', () => {
    document.getElementById('api-key-modal').classList.add('hidden');
});

document.getElementById('save-api-key').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) {
        appState.apiKey = key;
        localStorage.setItem('openai_api_key', key);
        document.getElementById('api-key-modal').classList.add('hidden');

        // 生成ボタンがあればクリック
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn && !generateBtn.disabled) {
            generateBtn.click();
        }
    } else {
        alert('APIキーを入力してください');
    }
});

// ========================================
// その他のイベントリスナー
// ========================================
document.getElementById('quit-btn').addEventListener('click', () => {
    if (confirm('クイズを終了しますか?進捗は保存されません。')) {
        showScreen('home-screen');
        initHomeScreen();
    }
});

document.getElementById('continue-btn').addEventListener('click', () => {
    startQuiz();
});

document.getElementById('home-btn').addEventListener('click', () => {
    showScreen('home-screen');
    initHomeScreen();
});

document.getElementById('manage-references-btn').addEventListener('click', () => {
    showReferencesScreen();
});

document.getElementById('back-to-home-btn').addEventListener('click', () => {
    showScreen('home-screen');
    initHomeScreen();
});

// ========================================
// 参照元管理
// ========================================
function getReferencesGrouped() {
    const referencesMap = new Map();

    appState.questions.forEach(q => {
        // 古い問題（参照元情報がない場合）は「未分類」として扱う
        if (!q.reference) {
            if (!referencesMap.has('uncategorized')) {
                referencesMap.set('uncategorized', {
                    id: 'uncategorized',
                    fileName: '未分類',
                    uploadDate: null,
                    questions: []
                });
            }
            referencesMap.get('uncategorized').questions.push(q);
        } else {
            const refId = q.reference.id;
            if (!referencesMap.has(refId)) {
                referencesMap.set(refId, {
                    id: refId,
                    fileName: q.reference.fileName,
                    uploadDate: q.reference.uploadDate,
                    questions: []
                });
            }
            referencesMap.get(refId).questions.push(q);
        }
    });

    // 配列に変換してアップロード日時で降順ソート
    return Array.from(referencesMap.values()).sort((a, b) => {
        if (!a.uploadDate) return 1;
        if (!b.uploadDate) return -1;
        return new Date(b.uploadDate) - new Date(a.uploadDate);
    });
}

function showReferencesScreen() {
    const references = getReferencesGrouped();
    const container = document.getElementById('references-list');
    container.innerHTML = '';

    if (references.length === 0) {
        container.innerHTML = '<div class="empty-message">まだ問題が登録されていません</div>';
        showScreen('references-screen');
        return;
    }

    references.forEach(ref => {
        const refCard = document.createElement('div');
        refCard.className = 'reference-card';

        const dateStr = ref.uploadDate
            ? new Date(ref.uploadDate).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '不明';

        // 見出し別にグループ化
        const sectionGroups = new Map();
        ref.questions.forEach(q => {
            const section = q.reference?.section || '不明';
            if (!sectionGroups.has(section)) {
                sectionGroups.set(section, []);
            }
            sectionGroups.get(section).push(q);
        });

        // 見出し情報のHTML生成
        let sectionsHTML = '';
        if (sectionGroups.size > 0) {
            sectionsHTML = '<div class="sections-list">';
            sectionGroups.forEach((questions, section) => {
                sectionsHTML += `
                    <div class="section-item">
                        <span class="section-name">${section}</span>
                        <span class="section-count">${questions.length}問</span>
                    </div>
                `;
            });
            sectionsHTML += '</div>';
        }

        refCard.innerHTML = `
            <div class="reference-header">
                <div class="reference-info">
                    <h3 class="reference-filename">📄 ${ref.fileName}</h3>
                    <p class="reference-date">アップロード日時: ${dateStr}</p>
                </div>
                <div class="reference-stats">
                    <div class="reference-count">${ref.questions.length}問</div>
                </div>
            </div>
            ${sectionsHTML}
            <div class="reference-actions">
                <button class="btn btn-danger btn-sm" onclick="deleteReference('${ref.id}')">
                    🗑️ 削除
                </button>
            </div>
        `;

        container.appendChild(refCard);
    });

    showScreen('references-screen');
}

function deleteReference(referenceId) {
    const references = getReferencesGrouped();
    const reference = references.find(ref => ref.id === referenceId);

    if (!reference) return;

    const confirmMessage = `「${reference.fileName}」の問題${reference.questions.length}問を削除しますか？\n\nこの操作は取り消せません。`;

    if (!confirm(confirmMessage)) {
        return;
    }

    // 該当する参照元の問題を削除
    if (referenceId === 'uncategorized') {
        appState.questions = appState.questions.filter(q => q.reference);
    } else {
        appState.questions = appState.questions.filter(q =>
            !q.reference || q.reference.id !== referenceId
        );
    }

    saveQuestions();

    // 画面を更新
    showReferencesScreen();

    alert(`${reference.questions.length}問の問題を削除しました`);
}

// ========================================
// ユーティリティ関数
// ========================================
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initHomeScreen();
});
