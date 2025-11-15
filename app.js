// ========================================
// グローバル変数
// ========================================
let appState = {
    apiKey: localStorage.getItem('openai_api_key') || '',
    questions: JSON.parse(localStorage.getItem('questions') || '[]'),
    materials: JSON.parse(localStorage.getItem('materials') || '[]'),
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
    selectedAnswer: null,
    currentMaterialId: null,
    // 学習設定
    selectedMaterial: 'all', // 選択された教材ID（'all'は全問題）
    questionCount: 10 // 出題数
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
    updateMaterialSelect();
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

function updateMaterialSelect() {
    const select = document.getElementById('material-select');
    if (!select) return;

    // 現在の選択を保持
    const currentValue = select.value;

    // 全問題オプションを残してリセット
    select.innerHTML = '<option value="all">全ての問題からランダム</option>';

    // 教材リストを追加（学習履歴の新しい順）
    const materials = [...appState.materials].sort((a, b) =>
        new Date(b.uploadDate) - new Date(a.uploadDate)
    ).slice(0, 10); // 最新10件のみ

    materials.forEach(material => {
        const option = document.createElement('option');
        option.value = material.id;
        const questionCount = appState.questions.filter(q => q.materialId === material.id).length;
        option.textContent = `${material.title} (${questionCount}問)`;
        select.appendChild(option);
    });

    // 選択を復元
    select.value = currentValue;
    appState.selectedMaterial = select.value;
}

function updateStartButton() {
    const btn = document.getElementById('start-quiz-btn');

    if (appState.questions.length === 0) {
        btn.disabled = true;
        btn.textContent = 'まずクイズを生成してください';
    } else {
        btn.disabled = false;
        btn.textContent = '学習を開始する';
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

        // 教材メタデータ生成
        updateGeneratingStatus('教材情報を分析中...', 35);
        const metadata = await generateMaterialMetadata(text, file.name);

        // クイズ生成
        updateGeneratingStatus('AIがクイズを生成中...', 60);
        const questions = await generateQuestionsWithAI(text, file.name);

        // 教材IDを生成
        const materialId = 'mat_' + Date.now();

        // 教材データを作成・保存
        const material = {
            id: materialId,
            title: metadata.title,
            summary: metadata.summary,
            fileName: file.name,
            content: text, // 本文全体を保存（マークダウン形式）
            tags: metadata.tags || [],
            uploadDate: new Date().toISOString(),
            questionIds: questions.map(q => q.id)
        };

        appState.materials.push(material);
        saveMaterials();

        // 問題にmaterialIdを追加
        const questionsWithMaterialId = questions.map(q => ({
            ...q,
            materialId: materialId
        }));

        // 保存
        updateGeneratingStatus('保存しています...', 90);
        appState.questions = [...appState.questions, ...questionsWithMaterialId];
        saveQuestions();

        updateGeneratingStatus('完了!', 100);

        setTimeout(() => {
            showScreen('home-screen');
            initHomeScreen();
            alert(`教材「${material.title}」から${questions.length}問のクイズを生成しました!`);
        }, 500);

    } catch (error) {
        console.error('クイズ生成エラー:', error);
        alert('クイズの生成に失敗しました: ' + error.message);
        showScreen('home-screen');
    }
}

// テキストからクイズを生成
async function generateQuizFromText(rawText, fileName = 'テキスト入力') {
    showScreen('generating-screen');

    try {
        // テキストをマークダウン形式に変換
        updateGeneratingStatus('テキストを整形中...', 20);
        const markdownText = await convertTextToMarkdown(rawText);

        // 教材メタデータ生成
        updateGeneratingStatus('教材情報を分析中...', 35);
        const metadata = await generateMaterialMetadata(markdownText, fileName);

        // クイズ生成
        updateGeneratingStatus('AIがクイズを生成中...', 60);
        const questions = await generateQuestionsWithAI(markdownText, fileName);

        // 教材IDを生成
        const materialId = 'mat_' + Date.now();

        // 教材データを作成・保存
        const material = {
            id: materialId,
            title: metadata.title,
            summary: metadata.summary,
            fileName: fileName,
            content: markdownText, // マークダウン形式の本文
            tags: metadata.tags || [],
            uploadDate: new Date().toISOString(),
            questionIds: questions.map(q => q.id)
        };

        appState.materials.push(material);
        saveMaterials();

        // 問題にmaterialIdを追加
        const questionsWithMaterialId = questions.map(q => ({
            ...q,
            materialId: materialId
        }));

        // 保存
        updateGeneratingStatus('保存しています...', 90);
        appState.questions = [...appState.questions, ...questionsWithMaterialId];
        saveQuestions();

        updateGeneratingStatus('完了!', 100);

        // テキスト入力欄をクリア
        document.getElementById('text-input').value = '';

        setTimeout(() => {
            showScreen('home-screen');
            initHomeScreen();
            alert(`教材「${material.title}」から${questions.length}問のクイズを生成しました!`);
        }, 500);

    } catch (error) {
        console.error('クイズ生成エラー:', error);
        alert('クイズの生成に失敗しました: ' + error.message);
        showScreen('home-screen');
    }
}

// GPTでテキストをマークダウン形式に変換
async function convertTextToMarkdown(text) {
    const maxChars = 12000;
    const truncatedText = text.slice(0, maxChars);

    const prompt = `以下のテキストを見やすいマークダウン形式に整形してください。

要件:
1. 適切な見出し（#, ##, ###）を追加
2. 段落を整理
3. 重要な部分を強調（**太字**）
4. リストがあれば箇条書きに変換
5. 元の内容を変更せず、構造化のみ行う

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
                    content: 'あなたはテキスト整形の専門家です。与えられたテキストを見やすいマークダウン形式に整形します。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'テキスト整形に失敗しました');
    }

    const data = await response.json();
    return data.choices[0].message.content;
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

// GPTで教材のメタデータ（タイトル・要約・タグ）を生成
async function generateMaterialMetadata(text, fileName) {
    const maxChars = 6000; // メタデータ生成用に短めに
    const truncatedText = text.slice(0, maxChars);

    const prompt = `以下のテキストを分析して、学習教材としてのメタデータを生成してください。

要件:
1. 教材の内容を表す適切なタイトル（20文字以内）
2. 教材の内容を要約した説明文（100文字以内）
3. 教材の内容を表すタグ（3-5個のキーワード）
4. JSON形式で出力

出力形式:
{
  "title": "教材のタイトル",
  "summary": "教材の要約説明",
  "tags": ["タグ1", "タグ2", "タグ3"]
}

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
                    content: 'あなたは教育コンテンツの分析専門家です。与えられたテキストから適切なタイトル、要約、タグを生成します。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.5,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        // メタデータ生成に失敗した場合はデフォルト値を返す
        return {
            title: fileName.replace(/\.[^/.]+$/, ''), // 拡張子を除いたファイル名
            summary: '教材の説明を生成できませんでした。',
            tags: ['未分類']
        };
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
        return JSON.parse(content);
    } catch (e) {
        console.error('Metadata JSON parse error:', e);
        return {
            title: fileName.replace(/\.[^/.]+$/, ''),
            summary: '教材の説明を生成できませんでした。',
            tags: ['未分類']
        };
    }
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
    // ユーザー設定に基づいてクイズを選択
    appState.currentQuiz = selectQuestions();
    appState.currentQuestionIndex = 0;
    appState.currentSession = { correct: 0, total: 0 };

    if (appState.currentQuiz.length === 0) {
        alert('出題する問題がありません');
        return;
    }

    showScreen('quiz-screen');
    displayQuestion();
}

function selectQuestions() {
    // 教材フィルター
    let availableQuestions = appState.selectedMaterial === 'all'
        ? appState.questions
        : appState.questions.filter(q => q.materialId === appState.selectedMaterial);

    if (availableQuestions.length === 0) {
        return [];
    }

    // 出題数の設定
    const count = Math.min(appState.questionCount, availableQuestions.length);

    // ランダムシャッフルして指定数を選択
    return shuffleArray(availableQuestions).slice(0, count);
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

function saveMaterials() {
    localStorage.setItem('materials', JSON.stringify(appState.materials));
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
    showMaterialsLibrary();
});

document.getElementById('back-to-home-btn').addEventListener('click', () => {
    showScreen('home-screen');
    initHomeScreen();
});

document.getElementById('back-to-library-btn')?.addEventListener('click', () => {
    showMaterialsLibrary();
});

// ========================================
// 教材ライブラリ管理
// ========================================
let filteredMaterials = [];

function showMaterialsLibrary() {
    const container = document.getElementById('references-list');
    container.innerHTML = '';

    if (appState.materials.length === 0) {
        container.innerHTML = '<div class="empty-message">まだ教材が登録されていません。<br>PDFをアップロードしてクイズを生成してください。</div>';
        showScreen('references-screen');
        return;
    }

    // フィルターとソートを適用
    filteredMaterials = applyFiltersAndSort();

    // タグフィルターの選択肢を更新
    updateTagFilter();

    // 教材カードを表示
    filteredMaterials.forEach(material => {
        const materialCard = createMaterialCard(material);
        container.appendChild(materialCard);
    });

    showScreen('references-screen');
}

function createMaterialCard(material) {
    const card = document.createElement('div');
    card.className = 'material-card';

    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    const questions = appState.questions.filter(q => q.materialId === material.id);
    const questionCount = questions.length;

    // 正解率を計算
    const answeredQuestions = questions.filter(q => q.lastReviewed);
    const correctCount = answeredQuestions.filter(q => q.reviewCount > 0).length;
    const accuracy = answeredQuestions.length > 0
        ? Math.round((correctCount / answeredQuestions.length) * 100)
        : 0;

    // タグHTML生成
    const tagsHTML = material.tags.map(tag =>
        `<span class="tag">${tag}</span>`
    ).join('');

    card.innerHTML = `
        <div class="material-card-header">
            <h3 class="material-title">${material.title}</h3>
            <div class="material-date">📅 ${dateStr}</div>
        </div>
        <p class="material-summary">${material.summary}</p>
        <div class="material-tags">${tagsHTML || '<span class="tag">未分類</span>'}</div>
        <div class="material-stats">
            <span class="stat-item">📝 ${questionCount}問</span>
            <span class="stat-item">📊 正解率 ${accuracy}%</span>
        </div>
    `;

    card.addEventListener('click', () => {
        showMaterialDetail(material.id);
    });

    return card;
}

function applyFiltersAndSort() {
    let materials = [...appState.materials];

    // 検索フィルター
    const searchQuery = document.getElementById('material-search')?.value.toLowerCase();
    if (searchQuery) {
        materials = materials.filter(m =>
            m.title.toLowerCase().includes(searchQuery) ||
            m.summary.toLowerCase().includes(searchQuery) ||
            m.tags.some(tag => tag.toLowerCase().includes(searchQuery))
        );
    }

    // タグフィルター
    const tagFilter = document.getElementById('tag-filter')?.value;
    if (tagFilter) {
        materials = materials.filter(m => m.tags.includes(tagFilter));
    }

    // ソート
    const sortFilter = document.getElementById('sort-filter')?.value || 'date-desc';
    switch (sortFilter) {
        case 'date-desc':
            materials.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
            break;
        case 'date-asc':
            materials.sort((a, b) => new Date(a.uploadDate) - new Date(b.uploadDate));
            break;
        case 'title':
            materials.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
            break;
        case 'questions':
            materials.sort((a, b) => {
                const aCount = appState.questions.filter(q => q.materialId === a.id).length;
                const bCount = appState.questions.filter(q => q.materialId === b.id).length;
                return bCount - aCount;
            });
            break;
    }

    return materials;
}

function updateTagFilter() {
    const select = document.getElementById('tag-filter');
    if (!select) return;

    // すべてのタグを収集
    const allTags = new Set();
    appState.materials.forEach(m => {
        m.tags.forEach(tag => allTags.add(tag));
    });

    // 現在の選択を保持
    const currentValue = select.value;

    // オプションを更新
    select.innerHTML = '<option value="">すべてのタグ</option>';
    Array.from(allTags).sort().forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        select.appendChild(option);
    });

    select.value = currentValue;
}

// フィルター変更時のイベントリスナー
document.getElementById('material-search')?.addEventListener('input', showMaterialsLibrary);
document.getElementById('tag-filter')?.addEventListener('change', showMaterialsLibrary);
document.getElementById('sort-filter')?.addEventListener('change', showMaterialsLibrary);

function deleteMaterial(materialId) {
    const material = appState.materials.find(m => m.id === materialId);

    if (!material) return;

    const questionCount = appState.questions.filter(q => q.materialId === materialId).length;
    const confirmMessage = `教材「${material.title}」とその問題${questionCount}問を削除しますか？\n\nこの操作は取り消せません。`;

    if (!confirm(confirmMessage)) {
        return;
    }

    // 教材を削除
    appState.materials = appState.materials.filter(m => m.id !== materialId);
    saveMaterials();

    // 関連する問題を削除
    appState.questions = appState.questions.filter(q => q.materialId !== materialId);
    saveQuestions();

    // ライブラリ画面に戻る
    showMaterialsLibrary();

    alert(`教材「${material.title}」を削除しました`);
}

// ========================================
// 教材詳細ページ
// ========================================
function showMaterialDetail(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return;

    appState.currentMaterialId = materialId;

    // 教材情報を表示
    document.getElementById('detail-material-title').textContent = material.title;
    document.getElementById('detail-material-summary').textContent = material.summary;

    // タグを表示
    const tagsContainer = document.getElementById('detail-material-tags');
    tagsContainer.innerHTML = material.tags.map(tag =>
        `<span class="tag">${tag}</span>`
    ).join('') || '<span class="tag">未分類</span>';

    // メタ情報を表示
    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    const questions = appState.questions.filter(q => q.materialId === materialId);
    document.getElementById('detail-upload-date').textContent = `📅 ${dateStr}`;
    document.getElementById('detail-question-count').textContent = `📝 ${questions.length}問`;

    // 概要タブのデータを更新
    updateOverviewTab(material, questions);

    // 問題一覧タブのデータを更新
    updateQuestionsTab(material, questions);

    // 本文タブのデータを更新
    updateContentTab(material);

    // タブをリセット
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector('.tab-btn[data-tab="overview"]').classList.add('active');
    document.getElementById('tab-overview').classList.add('active');

    showScreen('material-detail-screen');
}

function updateOverviewTab(material, questions) {
    const total = questions.length;
    const answeredQuestions = questions.filter(q => q.lastReviewed);
    const correctCount = answeredQuestions.filter(q => q.reviewCount > 0).length;
    const accuracy = answeredQuestions.length > 0
        ? Math.round((correctCount / answeredQuestions.length) * 100)
        : 0;
    const progress = total > 0
        ? Math.round((answeredQuestions.length / total) * 100)
        : 0;

    document.getElementById('overview-total').textContent = `${total}問`;
    document.getElementById('overview-accuracy').textContent = `${accuracy}%`;
    document.getElementById('overview-progress').textContent = `${progress}%`;
}

function updateQuestionsTab(material, questions) {
    const container = document.getElementById('questions-list');
    container.innerHTML = '';

    if (questions.length === 0) {
        container.innerHTML = '<div class="empty-message">この教材には問題がありません</div>';
        return;
    }

    questions.forEach((q, index) => {
        const questionCard = document.createElement('div');
        questionCard.className = 'question-item';

        const difficultyBadge = getDifficultyBadge(q.difficulty);
        const sectionTag = q.reference?.section || q.sourceSection || '不明';
        const lastReviewed = q.lastReviewed
            ? new Date(q.lastReviewed).toLocaleDateString('ja-JP')
            : '未学習';

        questionCard.innerHTML = `
            <div class="question-item-header">
                <span class="question-number">Q${index + 1}</span>
                ${difficultyBadge}
            </div>
            <div class="question-item-text">${q.question}</div>
            <div class="question-item-meta">
                <span class="section-tag">🏷️ ${sectionTag}</span>
                <span class="last-reviewed">最終学習: ${lastReviewed}</span>
            </div>
        `;

        container.appendChild(questionCard);
    });
}

function updateContentTab(material) {
    const container = document.getElementById('material-content');

    // マークダウン形式の本文を表示（シンプルな表示）
    const content = material.content || 'この教材には本文が保存されていません。';

    // 改行を<br>に変換し、見出しを強調
    const formattedContent = content
        .split('\n')
        .map(line => {
            if (line.startsWith('# ')) {
                return `<h1>${line.substring(2)}</h1>`;
            } else if (line.startsWith('## ')) {
                return `<h2>${line.substring(3)}</h2>`;
            } else if (line.startsWith('### ')) {
                return `<h3>${line.substring(4)}</h3>`;
            } else if (line.trim() === '') {
                return '<br>';
            } else {
                return `<p>${line}</p>`;
            }
        })
        .join('');

    container.innerHTML = formattedContent;
}

function getDifficultyBadge(difficulty) {
    const badges = {
        'basic': '<span class="difficulty-badge basic">基礎</span>',
        'standard': '<span class="difficulty-badge standard">標準</span>',
        'advanced': '<span class="difficulty-badge advanced">応用</span>'
    };
    return badges[difficulty] || '<span class="difficulty-badge">不明</span>';
}

// タブ切り替え
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');

        // すべてのタブボタンとコンテンツから active を削除
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // クリックされたタブをアクティブに
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
    });
});

// この教材から学習するボタン
document.getElementById('start-material-quiz-btn')?.addEventListener('click', () => {
    const materialId = appState.currentMaterialId;
    if (!materialId) return;

    const questions = appState.questions.filter(q => q.materialId === materialId);
    if (questions.length === 0) {
        alert('この教材には問題がありません');
        return;
    }

    // 問題をシャッフルして最大10問選択
    appState.currentQuiz = shuffleArray(questions).slice(0, 10);
    appState.currentQuestionIndex = 0;
    appState.currentSession = { correct: 0, total: 0 };

    showScreen('quiz-screen');
    displayQuestion();
});

// 教材削除ボタン
document.getElementById('delete-material-btn')?.addEventListener('click', () => {
    const materialId = appState.currentMaterialId;
    if (materialId) {
        deleteMaterial(materialId);
    }
});

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
// ホーム画面UI - PDF/テキスト切り替え
// ========================================
document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode');

        // タブの切り替え
        document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // コンテンツの切り替え
        document.querySelectorAll('.input-mode').forEach(m => m.classList.remove('active'));
        document.getElementById(`${mode}-mode`).classList.add('active');
    });
});

// ========================================
// ホーム画面UI - 出題数選択
// ========================================
document.querySelectorAll('.count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const count = parseInt(btn.getAttribute('data-count'));
        appState.questionCount = count;

        // ボタンの選択状態を更新
        document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// ========================================
// ホーム画面UI - 教材選択
// ========================================
document.getElementById('material-select')?.addEventListener('change', (e) => {
    appState.selectedMaterial = e.target.value;
});

// ========================================
// テキストから問題生成
// ========================================
document.getElementById('generate-from-text-btn')?.addEventListener('click', async function() {
    const textInput = document.getElementById('text-input');
    const text = textInput.value.trim();

    if (!text || text.length < 100) {
        alert('少なくとも100文字以上のテキストを入力してください');
        return;
    }

    // APIキーの確認
    if (!appState.apiKey) {
        showApiKeyModal();
        return;
    }

    await generateQuizFromText(text, 'テキスト入力');
});

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    initHomeScreen();
});
