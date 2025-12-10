// ========================================
// Firebase設定
// ========================================
// 注意: 本番環境では環境変数から読み込むことを推奨
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase初期化
let firebaseApp = null;
let auth = null;
let db = null;
let currentUser = null;

function initFirebase() {
    // Firebase設定が未設定の場合はスキップ
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.log('Firebase: 設定が未完了です。Googleログイン機能を使用するには、firebaseConfigを設定してください。');
        // ログインボタンを非表示にする
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.style.display = 'none';
        }
        return;
    }

    try {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        // 認証状態の監視
        auth.onAuthStateChanged(handleAuthStateChanged);
        console.log('Firebase: 初期化完了');
    } catch (error) {
        console.error('Firebase初期化エラー:', error);
    }
}

// ========================================
// 認証関連
// ========================================
async function handleAuthStateChanged(user) {
    currentUser = user;
    const loginBtn = document.getElementById('login-btn');
    const userMenu = document.getElementById('user-menu');

    if (user) {
        // ログイン状態
        if (loginBtn) loginBtn.classList.add('hidden');
        if (userMenu) {
            userMenu.classList.remove('hidden');
            document.getElementById('user-avatar').src = user.photoURL || 'https://via.placeholder.com/36';
            document.getElementById('user-name').textContent = user.displayName || 'ユーザー';
        }

        // クラウドからデータを同期
        await syncFromCloud();
    } else {
        // ログアウト状態
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (userMenu) userMenu.classList.add('hidden');
    }
}

async function signInWithGoogle() {
    if (!auth) {
        alert('Firebase設定が完了していません。\n\nGoogleログインを使用するには、app.js内のfirebaseConfigを設定してください。');
        return;
    }

    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        // モバイル対応: ポップアップよりリダイレクトが安定
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        if (isMobile) {
            await auth.signInWithRedirect(provider);
        } else {
            await auth.signInWithPopup(provider);
        }
    } catch (error) {
        console.error('ログインエラー:', error);
        if (error.code === 'auth/popup-blocked') {
            // ポップアップがブロックされた場合はリダイレクトで再試行
            const provider = new firebase.auth.GoogleAuthProvider();
            await auth.signInWithRedirect(provider);
        } else {
            alert('ログインに失敗しました: ' + error.message);
        }
    }
}

async function signOut() {
    if (!auth) return;

    try {
        await auth.signOut();
        showSyncIndicator('ログアウトしました', 'success');
    } catch (error) {
        console.error('ログアウトエラー:', error);
        alert('ログアウトに失敗しました');
    }
}

// ========================================
// データ同期関連
// ========================================
function updateSyncStatus(status, isError = false) {
    const syncStatusEl = document.getElementById('sync-status');
    if (syncStatusEl) {
        syncStatusEl.textContent = status;
        syncStatusEl.className = 'sync-status' + (isError ? ' error' : '');
    }
}

function showSyncIndicator(message, type = 'info') {
    // 既存のインジケーターを削除
    const existing = document.querySelector('.sync-indicator');
    if (existing) existing.remove();

    const indicator = document.createElement('div');
    indicator.className = `sync-indicator ${type}`;
    indicator.innerHTML = type === 'info'
        ? `<div class="spinner-small"></div><span>${message}</span>`
        : `<span>${message}</span>`;
    document.body.appendChild(indicator);

    // 3秒後に自動削除
    setTimeout(() => {
        indicator.remove();
    }, 3000);
}

async function syncToCloud() {
    if (!currentUser || !db) return;

    try {
        updateSyncStatus('同期中...');
        showSyncIndicator('クラウドに保存中...', 'info');

        const userDocRef = db.collection('users').doc(currentUser.uid);

        // データを準備
        const syncData = {
            questions: appState.questions,
            materials: appState.materials,
            userStats: appState.userStats,
            apiKey: appState.apiKey, // 暗号化推奨だが、まずはシンプルに
            lastSynced: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: new Date().toISOString()
        };

        await userDocRef.set(syncData, { merge: true });

        updateSyncStatus('同期完了');
        showSyncIndicator('クラウドに保存しました', 'success');
        console.log('クラウド同期完了');
    } catch (error) {
        console.error('同期エラー:', error);
        updateSyncStatus('同期失敗', true);
        showSyncIndicator('同期に失敗しました', 'error');
    }
}

async function syncFromCloud() {
    if (!currentUser || !db) return;

    try {
        updateSyncStatus('データを取得中...');
        showSyncIndicator('クラウドからデータを取得中...', 'info');

        const userDocRef = db.collection('users').doc(currentUser.uid);
        const doc = await userDocRef.get();

        if (doc.exists) {
            const cloudData = doc.data();

            // ローカルとクラウドのデータをマージ
            const mergedData = mergeData(cloudData);

            // appStateを更新
            appState.questions = mergedData.questions;
            appState.materials = mergedData.materials;
            appState.userStats = mergedData.userStats;
            if (cloudData.apiKey) {
                appState.apiKey = cloudData.apiKey;
            }

            // LocalStorageにも保存
            saveQuestions();
            saveMaterials();
            saveUserStats();
            if (cloudData.apiKey) {
                localStorage.setItem('openai_api_key', cloudData.apiKey);
            }

            // UIを更新
            initHomeScreen();

            updateSyncStatus('同期完了');
            showSyncIndicator('データを同期しました', 'success');
            console.log('クラウドからデータ取得完了');
        } else {
            // クラウドにデータがない場合、ローカルデータをアップロード
            console.log('クラウドにデータがありません。ローカルデータをアップロードします。');
            await syncToCloud();
        }
    } catch (error) {
        console.error('データ取得エラー:', error);
        updateSyncStatus('取得失敗', true);
        showSyncIndicator('データの取得に失敗しました', 'error');
    }
}

function mergeData(cloudData) {
    // クラウドデータとローカルデータをマージ
    // 基本戦略: IDベースで重複を排除し、より新しいデータを優先

    const localQuestions = appState.questions || [];
    const cloudQuestions = cloudData.questions || [];
    const localMaterials = appState.materials || [];
    const cloudMaterials = cloudData.materials || [];

    // 問題のマージ（IDで重複排除、lastReviewedが新しい方を優先）
    const questionMap = new Map();
    [...localQuestions, ...cloudQuestions].forEach(q => {
        const existing = questionMap.get(q.id);
        if (!existing) {
            questionMap.set(q.id, q);
        } else {
            // lastReviewedが新しい方を優先
            const existingDate = existing.lastReviewed ? new Date(existing.lastReviewed) : new Date(0);
            const newDate = q.lastReviewed ? new Date(q.lastReviewed) : new Date(0);
            if (newDate > existingDate) {
                questionMap.set(q.id, q);
            }
        }
    });

    // 教材のマージ（IDで重複排除、uploadDateが新しい方を優先）
    const materialMap = new Map();
    [...localMaterials, ...cloudMaterials].forEach(m => {
        const existing = materialMap.get(m.id);
        if (!existing) {
            materialMap.set(m.id, m);
        } else {
            // uploadDateが新しい方を優先
            const existingDate = new Date(existing.uploadDate);
            const newDate = new Date(m.uploadDate);
            if (newDate > existingDate) {
                materialMap.set(m.id, m);
            }
        }
    });

    // 統計のマージ（数値が大きい方を優先）
    const localStats = appState.userStats || {};
    const cloudStats = cloudData.userStats || {};
    const mergedStats = {
        totalAnswered: Math.max(localStats.totalAnswered || 0, cloudStats.totalAnswered || 0),
        correctAnswers: Math.max(localStats.correctAnswers || 0, cloudStats.correctAnswers || 0),
        lastStudyDate: [localStats.lastStudyDate, cloudStats.lastStudyDate]
            .filter(Boolean)
            .sort((a, b) => new Date(b) - new Date(a))[0] || null,
        streak: Math.max(localStats.streak || 0, cloudStats.streak || 0)
    };

    return {
        questions: Array.from(questionMap.values()),
        materials: Array.from(materialMap.values()),
        userStats: mergedStats
    };
}

// データ変更時に自動同期（デバウンス付き）
let syncTimeout = null;
function scheduleSync() {
    if (!currentUser) return;

    // 3秒後に同期（連続変更をまとめる）
    if (syncTimeout) {
        clearTimeout(syncTimeout);
    }
    syncTimeout = setTimeout(() => {
        syncToCloud();
    }, 3000);
}

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
    previousQuestion: null,  // 前の問題を保持（解説読み直し用）
    // 学習設定
    selectedMaterial: 'review-priority', // 選択された教材ID（デフォルトは復習待ち優先）
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

    // タグ統計を更新
    updateTagCloud();
}

// タグクラウドを更新
function updateTagCloud() {
    const container = document.getElementById('tag-cloud');
    container.innerHTML = '';

    // 全ての問題からタグを収集し、正解回数をカウント
    const tagStats = {};

    appState.questions.forEach(q => {
        if (q.tags && Array.isArray(q.tags)) {
            q.tags.forEach(tag => {
                if (!tagStats[tag]) {
                    tagStats[tag] = {
                        total: 0,
                        correct: 0
                    };
                }

                // 学習済みの問題のみカウント
                if (q.lastReviewed) {
                    tagStats[tag].total++;

                    // 正解判定（reviewCountが1以上なら少なくとも1回は正解している）
                    // より正確には、最後の回答が正解かどうかで判定
                    // ここでは簡易的にreviewCountが1以上なら正解としてカウント
                    if (q.reviewCount > 0) {
                        tagStats[tag].correct++;
                    }
                }
            });
        }
    });

    // タグがない場合
    const tags = Object.keys(tagStats);
    if (tags.length === 0) {
        container.innerHTML = '<div class="tag-cloud-empty">まだ学習したタグがありません。<br>問題を解いてジャンルを広げましょう！</div>';
        return;
    }

    // タグを正解回数でソート
    const sortedTags = tags.sort((a, b) => tagStats[b].correct - tagStats[a].correct);

    // 最大正解回数を取得（フォントサイズの正規化用）
    const maxCorrect = Math.max(...sortedTags.map(tag => tagStats[tag].correct), 1);

    // タグクラウドを生成（学習回数0のタグは非表示）
    sortedTags.forEach(tag => {
        const stat = tagStats[tag];
        const correctCount = stat.correct;
        const totalCount = stat.total;

        // 学習回数が0のタグはスキップ
        if (totalCount === 0) {
            return;
        }

        // 正解回数に応じてフォントサイズを調整（12px〜28px）
        const fontSize = 12 + Math.floor((correctCount / maxCorrect) * 16);

        const tagItem = document.createElement('div');
        tagItem.className = 'tag-cloud-item';
        tagItem.style.fontSize = `${fontSize}px`;
        tagItem.title = `${tag}: ${correctCount}/${totalCount}問正解`;
        tagItem.textContent = `${tag} (${correctCount})`;

        container.appendChild(tagItem);
    });
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

    // 画像生成モードの確認
    const imageGenEnabled = document.getElementById('image-gen-checkbox')?.checked || false;
    const questionCount = imageGenEnabled ? 5 : 30;

    try {
        // PDFテキスト抽出
        updateGeneratingStatus('PDFを読み込んでいます...', 15);
        const text = await extractTextFromPDF(file);

        if (!text || text.trim().length < 100) {
            throw new Error('PDFからテキストを抽出できませんでした');
        }

        // 教材メタデータ生成
        updateGeneratingStatus('教材情報を分析中...', 30);
        const metadata = await generateMaterialMetadata(text, file.name);

        // クイズ生成
        updateGeneratingStatus('AIがクイズを生成中...', 45);
        let questions = await generateQuestionsWithAI(text, file.name, questionCount);

        // 画像生成モードの場合、各問題に画像を生成
        if (imageGenEnabled) {
            questions = await generateImagesForQuestions(questions);
        }

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
        updateGeneratingStatus('保存しています...', 95);
        appState.questions = [...appState.questions, ...questionsWithMaterialId];
        saveQuestions();

        updateGeneratingStatus('完了!', 100);

        setTimeout(() => {
            showScreen('home-screen');
            initHomeScreen();
            const imageMsg = imageGenEnabled ? '（画像付き）' : '';
            alert(`教材「${material.title}」から${questions.length}問のクイズ${imageMsg}を生成しました!`);
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

    // 画像生成モードの確認
    const imageGenEnabled = document.getElementById('image-gen-checkbox')?.checked || false;
    const questionCount = imageGenEnabled ? 5 : 30;

    try {
        // テキストをマークダウン形式に変換
        updateGeneratingStatus('テキストを整形中...', 15);
        const markdownText = await convertTextToMarkdown(rawText);

        // 教材メタデータ生成
        updateGeneratingStatus('教材情報を分析中...', 30);
        const metadata = await generateMaterialMetadata(markdownText, fileName);

        // クイズ生成
        updateGeneratingStatus('AIがクイズを生成中...', 45);
        let questions = await generateQuestionsWithAI(markdownText, fileName, questionCount);

        // 画像生成モードの場合、各問題に画像を生成
        if (imageGenEnabled) {
            questions = await generateImagesForQuestions(questions);
        }

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
        updateGeneratingStatus('保存しています...', 95);
        appState.questions = [...appState.questions, ...questionsWithMaterialId];
        saveQuestions();

        updateGeneratingStatus('完了!', 100);

        // テキスト入力欄をクリア
        document.getElementById('text-input').value = '';

        setTimeout(() => {
            showScreen('home-screen');
            initHomeScreen();
            const imageMsg = imageGenEnabled ? '（画像付き）' : '';
            alert(`教材「${material.title}」から${questions.length}問のクイズ${imageMsg}を生成しました!`);
        }, 500);

    } catch (error) {
        console.error('クイズ生成エラー:', error);
        alert('クイズの生成に失敗しました: ' + error.message);
        showScreen('home-screen');
    }
}

// URLからクイズを生成
async function generateQuizFromUrl(url) {
    showScreen('generating-screen');

    // 画像生成モードの確認
    const imageGenEnabled = document.getElementById('image-gen-checkbox')?.checked || false;
    const questionCount = imageGenEnabled ? 5 : 30;

    try {
        // URLからテキストを取得
        updateGeneratingStatus('Webページを取得中...', 10);
        const text = await fetchTextFromUrl(url);

        if (!text || text.trim().length < 100) {
            throw new Error('Webページからテキストを抽出できませんでした。別のURLを試してください。');
        }

        // テキストをマークダウン形式に変換
        updateGeneratingStatus('テキストを整形中...', 20);
        const markdownText = await convertTextToMarkdown(text);

        // 教材メタデータ生成
        updateGeneratingStatus('教材情報を分析中...', 30);
        const hostname = new URL(url).hostname;
        const metadata = await generateMaterialMetadata(markdownText, hostname);

        // クイズ生成
        updateGeneratingStatus('AIがクイズを生成中...', 45);
        let questions = await generateQuestionsWithAI(markdownText, url, questionCount);

        // 画像生成モードの場合、各問題に画像を生成
        if (imageGenEnabled) {
            questions = await generateImagesForQuestions(questions);
        }

        // 教材IDを生成
        const materialId = 'mat_' + Date.now();

        // 教材データを作成・保存
        const material = {
            id: materialId,
            title: metadata.title,
            summary: metadata.summary,
            fileName: url,
            content: markdownText,
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
        updateGeneratingStatus('保存しています...', 95);
        appState.questions = [...appState.questions, ...questionsWithMaterialId];
        saveQuestions();

        updateGeneratingStatus('完了!', 100);

        // URL入力欄をクリア
        document.getElementById('url-input').value = '';

        setTimeout(() => {
            showScreen('home-screen');
            initHomeScreen();
            const imageMsg = imageGenEnabled ? '（画像付き）' : '';
            alert(`教材「${material.title}」から${questions.length}問のクイズ${imageMsg}を生成しました!`);
        }, 500);

    } catch (error) {
        console.error('クイズ生成エラー:', error);
        alert('クイズの生成に失敗しました: ' + error.message);
        showScreen('home-screen');
    }
}

// URLからテキストを取得
async function fetchTextFromUrl(url) {
    // CORSプロキシを使用してWebページを取得
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error('Webページの取得に失敗しました');
    }

    const html = await response.text();

    // HTMLからテキストを抽出
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 不要な要素を削除
    const elementsToRemove = doc.querySelectorAll('script, style, nav, header, footer, aside, iframe, noscript');
    elementsToRemove.forEach(el => el.remove());

    // メインコンテンツを取得（article, main, または body）
    const mainContent = doc.querySelector('article') || doc.querySelector('main') || doc.body;

    // テキストを抽出して整形
    let text = mainContent.innerText || mainContent.textContent;

    // 余分な空白を削除
    text = text.replace(/\s+/g, ' ').trim();

    // 最大文字数を制限
    const maxChars = 15000;
    if (text.length > maxChars) {
        text = text.slice(0, maxChars);
    }

    return text;
}

// 画像生成用のクリエイティブなプロンプトを生成
async function generateImagePrompt(question, choices, correctAnswer) {
    const prompt = `クイズ問題に関連する「写真で一言」風のシュールで面白い写真のプロンプトを生成してください。

【問題】
${question}

【ルール】
1. 答えの文字やヒントは絶対に含めない
2. 問題のテーマに関連するが、少しズレた・シュールな状況
3. 見た人が「なんでこうなった？」とクスッと笑える場面
4. 日常の中の違和感、意外な組み合わせ、不思議な状況
5. 実写のストックフォト風

コンセプト: 松本人志の「ひとりごっつ」の写真で一言のような、
一見普通だけどよく見ると面白い、シュールな瞬間を切り取った写真

例：
- ビジネスの問題 → スーツ姿でプールに浮かぶ人
- 料理の問題 → 真剣な顔で野菜と会話する人
- 歴史の問題 → 現代の街中で迷子になった侍

英語で60語以内のプロンプトのみを出力。`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 150,
            temperature: 0.7
        })
    });

    if (!response.ok) {
        throw new Error('画像プロンプト生成に失敗しました');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// DALL-Eで画像を生成
async function generateImageWithDALLE(imagePrompt) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.apiKey}`
        },
        body: JSON.stringify({
            model: 'dall-e-3',
            prompt: `${imagePrompt}. Style: realistic stock photo, natural lighting, candid moment, slightly absurd or surreal situation. No text or letters in the image.`,
            n: 1,
            size: '1792x1024',
            quality: 'standard'
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '画像生成に失敗しました');
    }

    const data = await response.json();
    return data.data[0].url;
}

// クイズ問題に画像を生成
async function generateImagesForQuestions(questions) {
    const questionsWithImages = [];

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const correctAnswer = q.choices[q.correctIndex];

        try {
            // プログレス更新
            const progress = 60 + Math.floor((i / questions.length) * 30);
            updateGeneratingStatus(`画像を生成中... (${i + 1}/${questions.length})`, progress);

            // 画像プロンプト生成
            const imagePrompt = await generateImagePrompt(q.question, q.choices, correctAnswer);

            // DALL-Eで画像生成
            const imageUrl = await generateImageWithDALLE(imagePrompt);

            questionsWithImages.push({
                ...q,
                imageUrl: imageUrl,
                imagePrompt: imagePrompt
            });
        } catch (error) {
            console.error(`画像生成エラー (問題${i + 1}):`, error);
            // 画像生成に失敗した場合は画像なしで続行
            questionsWithImages.push(q);
        }
    }

    return questionsWithImages;
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

async function generateQuestionsWithAI(text, fileName, questionCount = 30) {
    const maxChars = 12000;
    const truncatedText = text.slice(0, maxChars);

    const prompt = `以下のテキストから${questionCount}問のクイズを生成してください。

【クイズの目標】
学習者が「なるほど！」と思い、次の日も覚えている問題を作る。

【問題文のルール】
- 1問1概念（複数の知識を混ぜない）
- 具体的なシチュエーションで出題（「〜の場面で」「〜する時」）
- 問題文は2-3文で簡潔に
- 答えを直接示唆しない

【選択肢のルール】
- 正解は明確に1つ
- 不正解は「ありそうで間違い」を選ぶ
- 似た形式で統一（全て名詞、全て動詞など）

【解説のルール】
- 「正解は〇〇です。」で始める
- なぜその答えなのか理由を1文で
- 関連する豆知識を1つ追加
- 100-150文字以内

【難易度】
- 基礎（テキストに明記）: 50%
- 応用（推論が必要）: 50%

出力形式（JSON）:
{
  "questions": [
    {
      "question": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctIndex": 0,
      "explanation": "解説文（100-150文字）",
      "difficulty": "basic",
      "sourceSection": "関連セクション",
      "tags": ["タグ1", "タグ2", "タグ3"]
    }
  ]
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
                    content: 'あなたは優秀なクイズ作成者です。学習者が「なるほど！」と感じ、記憶に残る問題を作成してください。シンプルで明確な問題文、紛らわしい選択肢、簡潔で役立つ解説を心がけてください。'
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

    const prompt = `以下のテキストを分析して、魅力的な学習教材としてのメタデータを生成してください。

要件:
1. **タイトル**: 教材の内容を表すキャッチーで興味を引くタイトル（20文字以内）
   - 単なる要約ではなく、学習意欲を喚起するタイトルに
   - 例: ❌「経済学の基礎」→ ✅「お金の流れで読み解く世界経済」

2. **要約**: 教材の魅力を伝える説明文（100文字以内）
   - 「この教材で何が学べるか」「なぜ面白いか」を明確に
   - 具体的で読者の好奇心をくすぐる内容に

3. **タグ**: 教材の内容を表す具体的なキーワード（3-5個）
   - 検索しやすく、内容を的確に表すタグ

4. JSON形式で出力

出力形式:
{
  "title": "魅力的な教材タイトル",
  "summary": "学習意欲をかき立てる要約説明",
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
                    content: 'あなたは、学習者の心をつかむ教育マーケティングの専門家です。教材の魅力を最大限に引き出し、学習意欲をかき立てるキャッチーなタイトルと、読者の好奇心をくすぐる要約を作成します。'
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

    // 進捗グリッドを初期化
    initProgressGrid();

    showScreen('quiz-screen');
    displayQuestion();
}

// 進捗グリッドを初期化
function initProgressGrid() {
    const grid = document.getElementById('quiz-progress-grid');
    grid.innerHTML = '';

    appState.currentQuiz.forEach((_, index) => {
        const cell = document.createElement('div');
        cell.className = 'progress-cell';
        cell.textContent = index + 1;
        cell.id = `progress-cell-${index}`;
        grid.appendChild(cell);
    });
}

// 進捗グリッドを更新
function updateProgressGrid() {
    // 全てのセルから current クラスを削除
    document.querySelectorAll('.progress-cell').forEach(cell => {
        cell.classList.remove('current');
    });

    // 現在の問題セルに current クラスを追加
    const currentCell = document.getElementById(`progress-cell-${appState.currentQuestionIndex}`);
    if (currentCell) {
        currentCell.classList.add('current');
    }
}

// 進捗グリッドに正誤結果を反映
function markProgressCell(index, isCorrect) {
    const cell = document.getElementById(`progress-cell-${index}`);
    if (cell) {
        cell.classList.remove('current');
        cell.classList.add(isCorrect ? 'correct' : 'incorrect');
    }
}

function selectQuestions() {
    // アーカイブされていない問題のみを対象
    const activeQuestions = appState.questions.filter(q => !q.archived);

    // 復習待ち優先モード
    if (appState.selectedMaterial === 'review-priority') {
        const reviewDue = activeQuestions.filter(q => isReviewDue(q));
        const count = Math.min(appState.questionCount, Math.max(reviewDue.length, activeQuestions.length));

        // 復習待ち問題を優先的に選択
        if (reviewDue.length >= count) {
            // 復習待ちだけで十分
            return shuffleArray(reviewDue).slice(0, count);
        } else {
            // 復習待ち + 新規問題で補う
            const remaining = count - reviewDue.length;
            const otherQuestions = activeQuestions.filter(q => !isReviewDue(q));
            const selected = [
                ...reviewDue,
                ...shuffleArray(otherQuestions).slice(0, remaining)
            ];
            return shuffleArray(selected);
        }
    }

    // 教材フィルター
    let availableQuestions = appState.selectedMaterial === 'all'
        ? activeQuestions
        : activeQuestions.filter(q => q.materialId === appState.selectedMaterial);

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

    // 進捗グリッド更新
    updateProgressGrid();

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

    // 画像表示
    const imageContainer = document.getElementById('question-image-container');
    const imageElement = document.getElementById('question-image');
    if (question.imageUrl) {
        imageElement.src = question.imageUrl;
        imageContainer.style.display = 'block';
    } else {
        imageContainer.style.display = 'none';
    }

    // タグ表示
    const tagsContainer = document.getElementById('question-tags');
    tagsContainer.innerHTML = '';
    if (question.tags && question.tags.length > 0) {
        question.tags.forEach(tag => {
            const tagEl = document.createElement('span');
            tagEl.className = 'tag';
            tagEl.textContent = tag;
            tagsContainer.appendChild(tagEl);
        });
    }

    // 選択肢表示（ランダム順序）
    const container = document.getElementById('choices-container');
    container.innerHTML = '';

    // 選択肢をシャッフル（元のインデックスを保持）
    const choicesWithIndex = question.choices.map((choice, index) => ({ choice, originalIndex: index }));
    const shuffledChoices = shuffleArray([...choicesWithIndex]);

    // シャッフルされた順序で正解のインデックスを更新
    const shuffledCorrectIndex = shuffledChoices.findIndex(item => item.originalIndex === Number(question.correctIndex));

    shuffledChoices.forEach((item, displayIndex) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'choice-wrapper';

        const number = document.createElement('span');
        number.className = 'choice-number';
        number.textContent = displayIndex + 1;

        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = item.choice;
        btn.onclick = () => selectChoice(displayIndex);

        wrapper.appendChild(number);
        wrapper.appendChild(btn);
        container.appendChild(wrapper);
    });

    // シャッフル後の正解インデックスを一時保存
    question._shuffledCorrectIndex = shuffledCorrectIndex;

    // リセット
    appState.selectedAnswer = null;
    document.getElementById('feedback-modal').classList.add('hidden');

    // ナビゲーション表示制御
    const navigation = document.getElementById('quiz-navigation');
    const reviewBtn = document.getElementById('review-explanation-btn');
    if (navigation && reviewBtn) {
        if (appState.currentQuestionIndex > 0 && appState.previousQuestion) {
            navigation.classList.remove('hidden');
            reviewBtn.disabled = false;
        } else {
            navigation.classList.add('hidden');
            reviewBtn.disabled = true;
        }
    }

    // 次の問題の画像を事前読み込み
    preloadNextQuestionImage();
}

// 次の問題の画像を事前読み込み
function preloadNextQuestionImage() {
    const nextIndex = appState.currentQuestionIndex + 1;
    if (nextIndex < appState.currentQuiz.length) {
        const nextQuestion = appState.currentQuiz[nextIndex];
        if (nextQuestion.imageUrl) {
            const img = new Image();
            img.src = nextQuestion.imageUrl;
        }
    }
}

// 自動進行用のタイマーID
let autoProgressTimer = null;

function selectChoice(index) {
    // 既に回答済みなら無視
    if (appState.selectedAnswer !== null) return;

    // 型を数値に厳密化
    appState.selectedAnswer = Number(index);

    // UI更新
    const choices = document.querySelectorAll('.choice-btn');
    choices.forEach((btn, i) => {
        btn.classList.remove('selected');
        if (i === index) {
            btn.classList.add('selected');
        }
    });

    // 即座に正誤判定を実行
    checkAnswer();
}

function checkAnswer() {
    // 既にタイマーが動いている場合はクリア
    if (autoProgressTimer) {
        clearTimeout(autoProgressTimer);
        autoProgressTimer = null;
    }

    const question = appState.currentQuiz[appState.currentQuestionIndex];
    // 型を数値に厳密化して比較
    const selectedAnswer = Number(appState.selectedAnswer);
    // シャッフル後の正解インデックスを使用
    const correctIndex = Number(question._shuffledCorrectIndex);
    const isCorrect = selectedAnswer === correctIndex;

    // 統計更新
    appState.currentSession.total++;
    if (isCorrect) {
        appState.currentSession.correct++;
    }

    // 進捗グリッドに正誤結果を反映
    markProgressCell(appState.currentQuestionIndex, isCorrect);

    // UI更新
    const choices = document.querySelectorAll('.choice-btn');
    choices.forEach((btn, i) => {
        btn.disabled = true;
        if (i === correctIndex) {
            btn.classList.add('correct');
        } else if (i === selectedAnswer && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });

    // フィードバックモーダル表示
    const feedbackModal = document.getElementById('feedback-modal');
    const icon = document.getElementById('feedback-icon');
    const title = document.getElementById('feedback-title');
    const explanation = document.getElementById('feedback-explanation');
    const timer = document.getElementById('feedback-timer');

    if (isCorrect) {
        icon.textContent = '🎉';
        title.textContent = '正解';
        title.style.color = '#10b981';
    } else {
        icon.textContent = '💡';
        title.textContent = '不正解';
        title.style.color = '#ef4444';
    }

    explanation.textContent = question.explanation;
    feedbackModal.classList.remove('hidden');

    // 表示時間を初回と復習で出し分け（updateQuestionStatsの前にチェック）
    const isFirstTime = !question.lastReviewed;
    let displayDuration;
    if (isFirstTime) {
        // 初回学習: 解説の長さに応じて8-15秒
        const explanationLength = question.explanation.length;
        // 基本8秒 + 50文字ごとに2秒追加、最大15秒
        displayDuration = Math.min(15, 8 + Math.floor(explanationLength / 50) * 2);
    } else {
        // 復習: 固定2秒
        displayDuration = 2;
    }

    // 間隔反復アルゴリズム適用（lastReviewedを更新）
    updateQuestionStats(question, isCorrect);

    let countdown = displayDuration;
    timer.textContent = countdown;

    const countdownInterval = setInterval(() => {
        countdown--;

        // チラつき防止: 数字変更時に短いフェード効果を追加
        timer.style.opacity = '0.5';
        setTimeout(() => {
            timer.textContent = countdown;
            timer.style.opacity = '1';
        }, 75);

        if (countdown <= 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);

    // 指定時間で自動的に次へ進む
    autoProgressTimer = setTimeout(() => {
        clearInterval(countdownInterval);
        nextQuestion();
    }, displayDuration * 1000);
}

function nextQuestion() {
    // 自動進行タイマーをクリア
    if (autoProgressTimer) {
        clearTimeout(autoProgressTimer);
        autoProgressTimer = null;
    }

    // 現在の問題を前の問題として保存（解説読み直し用）
    appState.previousQuestion = appState.currentQuiz[appState.currentQuestionIndex];

    // フィードバックモーダルを隠す
    document.getElementById('feedback-modal').classList.add('hidden');

    if (appState.currentQuestionIndex < appState.currentQuiz.length - 1) {
        // 10秒休憩(10問ごと)
        if ((appState.currentQuestionIndex + 1) % 10 === 0) {
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

// 前の問題の解説を再表示
function showPreviousExplanation() {
    if (!appState.previousQuestion) return;

    const feedbackModal = document.getElementById('feedback-modal');
    const icon = document.getElementById('feedback-icon');
    const title = document.getElementById('feedback-title');
    const explanation = document.getElementById('feedback-explanation');
    const timer = document.getElementById('feedback-timer');

    // 正解の選択肢を表示
    const correctChoice = appState.previousQuestion.choices[appState.previousQuestion.correctIndex];
    const correctChoiceText = `${appState.previousQuestion.correctIndex + 1}. ${correctChoice}`;

    icon.textContent = '📖';
    title.textContent = correctChoiceText;
    title.style.color = '#4f46e5';
    explanation.textContent = appState.previousQuestion.explanation;
    timer.style.display = 'none';  // タイマー非表示

    feedbackModal.classList.remove('hidden');

    // 次へボタンを「閉じる」に変更
    const nextBtn = document.getElementById('next-question-btn');
    const originalText = nextBtn.textContent;
    nextBtn.textContent = '閉じる';

    const closeHandler = () => {
        feedbackModal.classList.add('hidden');
        timer.style.display = 'flex';  // タイマー表示を戻す
        nextBtn.textContent = originalText;
        nextBtn.removeEventListener('click', closeHandler);
        nextBtn.addEventListener('click', nextQuestion);
    };

    nextBtn.removeEventListener('click', nextQuestion);
    nextBtn.addEventListener('click', closeHandler);
}

// 現在の問題をスキップ
function skipCurrentQuestion() {
    // 回答せずに次の問題に進む
    appState.selectedAnswer = null;
    document.getElementById('feedback-modal').classList.add('hidden');

    if (appState.currentQuestionIndex < appState.currentQuiz.length - 1) {
        appState.currentQuestionIndex++;
        displayQuestion();
    } else {
        // 最後の問題の場合はクイズを終了
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

    // シェアクイズの場合は認定書画面、それ以外は通常の結果画面
    if (appState.isSharedQuiz) {
        showCertificate();
    } else {
        showResultScreen();
    }
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

// 認定書画面を表示（シェアクイズ用）
function showCertificate() {
    const { correct, total } = appState.currentSession;
    const accuracy = Math.round((correct / total) * 100);
    const quizTitle = appState.sharedQuizTitle || 'クイズ';

    // 認定書の内容を設定
    document.getElementById('cert-quiz-title').textContent = quizTitle;
    document.getElementById('cert-score').textContent = `${accuracy}%`;
    document.getElementById('cert-detail').textContent = `(${total}問中${correct}問正解)`;

    // 日付を設定
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    document.getElementById('cert-date').textContent = dateStr;

    // 認定書画面を表示
    showScreen('certificate-screen');
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
    scheduleSync(); // クラウド同期をスケジュール
}

function saveMaterials() {
    localStorage.setItem('materials', JSON.stringify(appState.materials));
    scheduleSync(); // クラウド同期をスケジュール
}

function saveUserStats() {
    localStorage.setItem('user_stats', JSON.stringify(appState.userStats));
    scheduleSync(); // クラウド同期をスケジュール
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
        scheduleSync(); // APIキーもクラウド同期
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

document.getElementById('back-to-home-from-review-btn')?.addEventListener('click', () => {
    showScreen('home-screen');
    initHomeScreen();
});

// 復習待ちカードをクリックして一覧表示
document.getElementById('review-count-card')?.addEventListener('click', () => {
    showReviewList();
});

// ========================================
// 復習待ち問題一覧
// ========================================
function showReviewList() {
    const reviewQuestions = appState.questions.filter(q => isReviewDue(q));
    const container = document.getElementById('review-questions-list');
    container.innerHTML = '';

    document.getElementById('review-list-count').textContent = reviewQuestions.length;

    if (reviewQuestions.length === 0) {
        container.innerHTML = '<div class="empty-message">復習待ちの問題はありません</div>';
        showScreen('review-list-screen');
        return;
    }

    // 教材別にグルーピング
    const groupedByMaterial = {};
    reviewQuestions.forEach(q => {
        if (!groupedByMaterial[q.materialId]) {
            groupedByMaterial[q.materialId] = [];
        }
        groupedByMaterial[q.materialId].push(q);
    });

    // 教材ごとに表示
    Object.keys(groupedByMaterial).forEach(materialId => {
        const material = appState.materials.find(m => m.id === materialId);
        const questions = groupedByMaterial[materialId];

        // 教材セクション
        const section = document.createElement('div');
        section.className = 'review-material-section';

        const header = document.createElement('div');
        header.className = 'review-material-header';
        header.innerHTML = `
            <h3>${material ? material.title : '不明な教材'}</h3>
            <span class="review-count-badge">${questions.length}問</span>
        `;
        section.appendChild(header);

        // 問題リスト
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
                    <span class="review-difficulty ${q.difficulty}">${
                        q.difficulty === 'basic' ? '基礎' :
                        q.difficulty === 'standard' ? '標準' : '応用'
                    }</span>
                    <span class="review-overdue">${
                        daysOverdue > 0 ? `${daysOverdue}日経過` : '本日'
                    }</span>
                </div>
            `;

            list.appendChild(item);
        });

        section.appendChild(list);
        container.appendChild(section);
    });

    showScreen('review-list-screen');
}

// ========================================
// 教材ライブラリ管理
// ========================================
let filteredMaterials = [];
let currentView = 'list'; // 'card' or 'list' - デフォルトはリスト表示

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

    // ビューに応じて教材をフィルタリング
    if (currentView === 'shared') {
        // 共有済みビュー：共有された教材のみ表示
        filteredMaterials = filteredMaterials.filter(m => m.isShared);
        if (filteredMaterials.length === 0) {
            container.innerHTML = '<div class="empty-message">まだ共有された教材がありません。</div>';
            showScreen('references-screen');
            return;
        }
    } else {
        // 通常ビュー：共有された教材を除外
        filteredMaterials = filteredMaterials.filter(m => !m.isShared);
        if (filteredMaterials.length === 0) {
            container.innerHTML = '<div class="empty-message">まだ教材が登録されていません。<br>PDFをアップロードしてクイズを生成してください。</div>';
            showScreen('references-screen');
            return;
        }
    }

    // ビューに応じて表示を切り替え（リスト表示のみ）
    container.className = 'materials-list';
    filteredMaterials.forEach(material => {
        const materialListItem = createMaterialListItem(material);
        container.appendChild(materialListItem);
    });

    showScreen('references-screen');
}

function createMaterialCard(material) {
    const card = document.createElement('div');
    card.className = 'material-card';

    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP', {
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

    // タグHTML生成（最大3つ）
    const tagsHTML = material.tags.slice(0, 3).map(tag =>
        `<span class="tag">${tag}</span>`
    ).join('');

    card.innerHTML = `
        <div>
            <div class="material-card-header">
                <h3 class="material-title">${material.title}</h3>
                <div class="material-date">${dateStr}</div>
            </div>
            <div class="material-tags">${tagsHTML}</div>
        </div>
        <div class="material-stats">
            <span class="stat-item">📝 ${questionCount}問</span>
            <span class="stat-item">📊 ${accuracy}%</span>
        </div>
    `;

    card.addEventListener('click', () => {
        showMaterialDetail(material.id);
    });

    return card;
}

function createMaterialListItem(material) {
    const item = document.createElement('div');
    item.className = 'material-list-item';

    const dateStr = new Date(material.uploadDate).toLocaleDateString('ja-JP');

    const questions = appState.questions.filter(q => q.materialId === material.id);
    const questionCount = questions.length;

    // 正解率を計算
    const answeredQuestions = questions.filter(q => q.lastReviewed);
    const correctCount = answeredQuestions.filter(q => q.reviewCount > 0).length;
    const accuracy = answeredQuestions.length > 0
        ? Math.round((correctCount / answeredQuestions.length) * 100)
        : 0;

    item.innerHTML = `
        <div class="material-list-main">
            <div class="material-list-title">${material.title}</div>
            <div class="material-list-date">${dateStr}</div>
        </div>
        <div class="material-list-stats">
            <span class="list-stat-item">📝 ${questionCount}問</span>
            <span class="list-stat-item">📊 ${accuracy}%</span>
        </div>
    `;

    item.addEventListener('click', () => {
        showMaterialDetail(material.id);
    });

    return item;
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
    }

    return materials;
}

// フィルター変更時のイベントリスナー
document.getElementById('material-search')?.addEventListener('input', showMaterialsLibrary);
document.getElementById('sort-filter')?.addEventListener('change', showMaterialsLibrary);

// ビュー切り替えボタン
document.getElementById('view-list-btn')?.addEventListener('click', function() {
    currentView = 'list';
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    this.classList.add('active');
    showMaterialsLibrary();
});

document.getElementById('view-shared-btn')?.addEventListener('click', function() {
    currentView = 'shared';
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
    this.classList.add('active');
    showMaterialsLibrary();
});

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

    // 共有済み/共有された教材のシェアボタンをグレーアウト
    const shareBtn = document.getElementById('share-material-btn');
    if (shareBtn) {
        if (material.isShared || material.hasBeenShared) {
            shareBtn.disabled = true;
            shareBtn.style.opacity = '0.5';
            shareBtn.style.cursor = 'not-allowed';
            shareBtn.title = '共有された教材は再共有できません';
        } else {
            shareBtn.disabled = false;
            shareBtn.style.opacity = '1';
            shareBtn.style.cursor = 'pointer';
            shareBtn.title = '';
        }
    }

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
        questionCard.className = 'question-item-mini';

        const correctAnswer = q.choices[q.correctIndex];

        questionCard.innerHTML = `
            <div class="question-mini-row">
                <div class="question-mini-label">Q</div>
                <div class="question-mini-text">${q.question}</div>
            </div>
            <div class="question-mini-row answer-row">
                <div class="question-mini-label">A</div>
                <div class="question-mini-answer">${correctAnswer}</div>
                <button class="btn-icon-mini delete-question-btn" data-question-id="${q.id}" title="削除">
                    🗑️
                </button>
            </div>
        `;

        container.appendChild(questionCard);
    });

    // 削除ボタンのイベントリスナー
    container.querySelectorAll('.delete-question-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const questionId = btn.dataset.questionId;
            deleteQuestion(questionId, material.id);
        });
    });
}

function updateContentTab(material) {
    const container = document.getElementById('material-content');

    // マークダウン形式の本文を表示（シンプルな表示）
    let content = material.content || 'この教材には本文が保存されていません。';

    // 画像URLなどの不要な文字列を削除
    content = content.replace(/!\[.*?\]\(https?:\/\/.*?\)/g, ''); // マークダウン形式の画像
    content = content.replace(/https?:\/\/\S+\.(png|jpg|jpeg|gif|svg)/gi, ''); // 画像URL

    // 改行を<br>に変換し、見出しを強調、見出しにアンカーIDを付ける
    const formattedContent = content
        .split('\n')
        .map(line => {
            // 太字処理を全ての行で実行
            if (line.includes('**')) {
                line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            }

            if (line.startsWith('# ')) {
                const heading = line.substring(2);
                const anchorId = 'heading-' + encodeURIComponent(heading.replace(/\s+/g, '-'));
                return `<h1 id="${anchorId}" class="content-heading-h1">${heading}</h1>`;
            } else if (line.startsWith('## ')) {
                const heading = line.substring(3);
                const anchorId = 'heading-' + encodeURIComponent(heading.replace(/\s+/g, '-'));
                return `<h2 id="${anchorId}" class="content-heading-h2">${heading}</h2>`;
            } else if (line.startsWith('### ')) {
                const heading = line.substring(4);
                const anchorId = 'heading-' + encodeURIComponent(heading.replace(/\s+/g, '-'));
                return `<h3 id="${anchorId}" class="content-heading-h3">${heading}</h3>`;
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                // リスト項目
                const text = line.substring(2);
                return `<div class="content-list-item">• ${text}</div>`;
            } else if (line.trim() === '') {
                return '';
            } else {
                return `<p>${line}</p>`;
            }
        })
        .filter(line => line !== '')
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

// URLからクイズ生成
document.getElementById('generate-from-url-btn')?.addEventListener('click', async function() {
    const urlInput = document.getElementById('url-input');
    const url = urlInput.value.trim();

    if (!url) {
        alert('URLを入力してください');
        return;
    }

    // URL形式の検証
    try {
        new URL(url);
    } catch (e) {
        alert('有効なURLを入力してください');
        return;
    }

    // APIキーの確認
    if (!appState.apiKey) {
        showApiKeyModal();
        return;
    }

    await generateQuizFromUrl(url);
});

// レポートタブの統計を更新する関数
function updateReportTab() {
    const totalAnswered = document.getElementById('total-answered');
    const totalCorrect = document.getElementById('total-correct');
    if (totalAnswered) totalAnswered.textContent = appState.userStats.totalAnswered;
    if (totalCorrect) totalCorrect.textContent = appState.userStats.correctAnswers;
}

// 見出しをハイライトする関数
function highlightHeading(anchorId) {
    // 本文タブに切り替え
    document.querySelector('.tab-btn[data-tab="content"]').click();

    // 少し待ってからスクロールとハイライト
    setTimeout(() => {
        const heading = document.getElementById(anchorId);
        if (heading) {
            // スムーズにスクロール
            heading.scrollIntoView({behavior: 'smooth', block: 'center'});

            // ハイライトクラスを追加
            heading.classList.add('highlight');

            // 3秒後にハイライトを削除
            setTimeout(() => {
                heading.classList.remove('highlight');
            }, 3000);
        }
    }, 100);
}

// ========================================
// 教材共有機能
// ========================================

/**
 * 共有用のデータを生成（APIキーや個人情報を除外）
 */
function generateShareData(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) {
        throw new Error('教材が見つかりません');
    }

    const questions = appState.questions.filter(q => q.materialId === materialId);

    // 共有用データ（個人情報を含まない、contentは除外してURLサイズを削減）
    const shareData = {
        version: 1,
        material: {
            title: material.title,
            summary: material.summary,
            // contentは除外（URLサイズ削減のため）
            tags: material.tags,
            fileName: material.fileName
        },
        questions: questions.map(q => ({
            question: q.question,
            choices: q.choices,
            correctIndex: q.correctIndex,
            // 解説を最初の100文字に短縮（URL長削減のため）
            explanation: q.explanation.substring(0, 100) + (q.explanation.length > 100 ? '...' : ''),
            difficulty: q.difficulty,
            sourceSection: q.sourceSection,
            tags: q.tags
        }))
    };

    return shareData;
}

/**
 * LZ-string圧縮で共有URLを生成
 */
function generateShareURL(materialId) {
    const shareData = generateShareData(materialId);
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(shareData));
    const baseURL = window.location.href.split('?')[0];
    const shareURL = `${baseURL}?share=${compressed}`;

    // URL長の警告（解説を短縮したため、より長いURLを許容）
    if (shareURL.length > 5000) {
        console.warn(`⚠️ Share URL is ${shareURL.length} characters (recommended < 5000). Some browsers may have issues.`);
        if (shareURL.length > 10000) {
            throw new Error(`共有URLが長すぎます（${shareURL.length}文字）。問題数を減らすか、解説をさらに短縮してください。`);
        }
    }

    console.log(`Share URL generated: ${shareURL.length} characters`);
    return shareURL;
}

/**
 * 認定証共有データを生成（軽量版）
 */
function generateCertificateShareData() {
    const { correct, total } = appState.currentSession;
    const accuracy = Math.round((correct / total) * 100);
    const quizTitle = appState.sharedQuizTitle || 'クイズ';
    const now = new Date();

    return {
        version: 1,
        type: 'certificate',
        quizTitle: quizTitle,
        accuracy: accuracy,
        correct: correct,
        total: total,
        date: now.toISOString()
    };
}

/**
 * 認定証共有URLを生成（短縮版）
 */
function generateCertificateShareURL() {
    const certData = generateCertificateShareData();
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(certData));
    const baseURL = window.location.href.split('?')[0];
    const shareURL = `${baseURL}?cert=${compressed}`;

    console.log(`Certificate share URL generated: ${shareURL.length} characters`);
    return shareURL;
}

/**
 * URLをクリップボードにコピー（LZ-string圧縮使用）
 */
function copyShareURL(materialId) {
    try {
        const url = generateShareURL(materialId);
        navigator.clipboard.writeText(url);

        // 共有済みフラグを設定
        const material = appState.materials.find(m => m.id === materialId);
        if (material) {
            material.hasBeenShared = true;
            localStorage.setItem('materials', JSON.stringify(appState.materials));

            // シェアボタンをグレーアウト
            const shareBtn = document.getElementById('share-material-btn');
            if (shareBtn) {
                shareBtn.disabled = true;
                shareBtn.style.opacity = '0.5';
                shareBtn.style.cursor = 'not-allowed';
                shareBtn.title = '共有済みの教材です';
            }
        }

        return true;
    } catch (err) {
        console.error('Failed to copy URL:', err);
        return false;
    }
}

/**
 * QRコードを生成して表示（LZ-string圧縮使用）
 */
function generateQRCode(materialId) {
    try {
        const url = generateShareURL(materialId);
        const qrContainer = document.getElementById('qr-code');
        qrContainer.innerHTML = ''; // 既存のQRコードをクリア

        // QRCodeライブラリが読み込まれているか確認
        if (typeof QRCode === 'undefined') {
            console.error('QRCode library is not loaded');
            alert('QRコードライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
            return;
        }

        new QRCode(qrContainer, {
            text: url,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });

        // 共有済みフラグを設定
        const material = appState.materials.find(m => m.id === materialId);
        if (material) {
            material.hasBeenShared = true;
            localStorage.setItem('materials', JSON.stringify(appState.materials));

            // シェアボタンをグレーアウト
            const shareBtn = document.getElementById('share-material-btn');
            if (shareBtn) {
                shareBtn.disabled = true;
                shareBtn.style.opacity = '0.5';
                shareBtn.style.cursor = 'not-allowed';
                shareBtn.title = '共有済みの教材です';
            }
        }
    } catch (err) {
        console.error('Failed to generate QR code:', err);
        alert('QRコードの生成に失敗しました。');
    }
}

/**
 * 共有データをインポートして教材を追加
 */
function importSharedMaterial(shareData) {
    const newMaterialId = 'mat_' + Date.now();
    const newReferenceId = 'ref_' + Date.now();

    // 教材を追加（タイトルに「(共有)」を付加 - 重複しないようにチェック）
    const titleSuffix = shareData.material.title.endsWith(' (共有)') ? '' : ' (共有)';
    const newMaterial = {
        id: newMaterialId,
        title: shareData.material.title + titleSuffix,
        summary: shareData.material.summary,
        // contentがない場合は要約から生成
        content: shareData.material.content || `# ${shareData.material.title}\n\n${shareData.material.summary}\n\n*この教材は共有URLからインポートされたため、元の本文は含まれていません。*`,
        tags: shareData.material.tags,
        fileName: shareData.material.fileName,
        uploadDate: new Date().toISOString(),
        questionIds: [],
        isShared: true // 共有された教材フラグ
    };

    // 問題を追加（学習データをリセット）
    const newQuestions = shareData.questions.map((q, index) => ({
        id: Date.now() + index + Math.random(),
        ...q,
        materialId: newMaterialId,
        lastReviewed: null,
        reviewCount: 0,
        easeFactor: 2.5,
        interval: 0,
        nextReview: null,
        reference: {
            id: newReferenceId,
            fileName: shareData.material.fileName,
            uploadDate: new Date().toISOString(),
            section: q.sourceSection || ''
        }
    }));

    newMaterial.questionIds = newQuestions.map(q => q.id);

    // LocalStorageに保存
    appState.materials.push(newMaterial);
    appState.questions.push(...newQuestions);
    localStorage.setItem('materials', JSON.stringify(appState.materials));
    localStorage.setItem('questions', JSON.stringify(appState.questions));

    return newMaterialId;
}

/**
 * ページ読み込み時に共有URLパラメータをチェック
 */
function checkForSharedMaterial() {
    const urlParams = new URLSearchParams(window.location.search);
    const share = urlParams.get('share');

    if (!share) {
        return;  // 共有パラメータなし
    }

    try {
        console.log('Loading from share URL (LZ-string compressed)');
        const decompressed = LZString.decompressFromEncodedURIComponent(share);

        if (!decompressed) {
            throw new Error('URLの解凍に失敗しました。URLが正しいか確認してください。');
        }

        const shareData = JSON.parse(decompressed);
        console.log('Parsed share data:', shareData);

        // バージョンチェック
        if (shareData.version !== 1) {
            throw new Error('サポートされていないバージョンです');
        }

        // データをインポート（内部で保存）
        const newMaterialId = importSharedMaterial(shareData);

        // シェア専用LP画面を表示
        showSharedQuizLanding(newMaterialId, shareData);

        // URLはクリーンアップしない（戻るボタンで戻れるように）
    } catch (err) {
        console.error('Failed to import shared material:', err);
        console.error('Error details:', err.message, err.stack);
        alert(`共有データの読み込みに失敗しました。\n\nエラー: ${err.message}\n\nURLが正しいか確認してください。`);

        // エラー時はURLをクリーンアップ
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

/**
 * ページ読み込み時に認定証URLパラメータをチェック
 */
function checkForSharedCertificate() {
    const urlParams = new URLSearchParams(window.location.search);
    const cert = urlParams.get('cert');

    if (!cert) {
        return false;  // 認定証パラメータなし
    }

    try {
        console.log('Loading from certificate URL (LZ-string compressed)');
        const decompressed = LZString.decompressFromEncodedURIComponent(cert);

        if (!decompressed) {
            throw new Error('URLの解凍に失敗しました。URLが正しいか確認してください。');
        }

        const certData = JSON.parse(decompressed);
        console.log('Parsed certificate data:', certData);

        // バージョン・タイプチェック
        if (certData.version !== 1 || certData.type !== 'certificate') {
            throw new Error('サポートされていないデータ形式です');
        }

        // 認定証画面を表示
        showSharedCertificate(certData);

        // URLはクリーンアップしない（戻るボタンで戻れるように）
        return true;
    } catch (err) {
        console.error('Failed to load shared certificate:', err);
        console.error('Error details:', err.message, err.stack);
        alert(`認定証の読み込みに失敗しました。\n\nエラー: ${err.message}\n\nURLが正しいか確認してください。`);

        // エラー時はURLをクリーンアップ
        window.history.replaceState({}, document.title, window.location.pathname);
        return false;
    }
}

/**
 * 共有された認定証を表示
 */
function showSharedCertificate(certData) {
    const { quizTitle, accuracy, correct, total, date } = certData;

    // 認定書の内容を設定
    document.getElementById('cert-quiz-title').textContent = quizTitle;
    document.getElementById('cert-score').textContent = `${accuracy}%`;
    document.getElementById('cert-detail').textContent = `(${total}問中${correct}問正解)`;

    // 日付を設定
    const certDate = new Date(date);
    const dateStr = `${certDate.getFullYear()}年${certDate.getMonth() + 1}月${certDate.getDate()}日`;
    document.getElementById('cert-date').textContent = dateStr;

    // 認定書画面を表示（共有モード）
    appState.isSharedQuiz = true; // 共有モードフラグ
    appState.sharedQuizTitle = quizTitle;
    appState.currentSession = { correct, total };

    // 共有された認定証を見ている場合は「もう一度挑戦」ボタンを非表示
    // （クイズデータがないため）
    const tryAgainBtn = document.getElementById('try-again-btn');
    if (tryAgainBtn) {
        tryAgainBtn.style.display = 'none';
    }

    // シェアボタンのテキストを変更
    const shareCertBtn = document.getElementById('share-certificate-btn');
    if (shareCertBtn) {
        shareCertBtn.textContent = '📤 私も結果をシェア';
        shareCertBtn.style.display = 'none'; // まだクイズを受けていないので非表示
    }

    showScreen('certificate-screen');
}

/**
 * シェア専用LP画面を表示
 */
function showSharedQuizLanding(materialId, shareData) {
    const title = shareData.material.title;
    const questionCount = shareData.questions.length;
    const estimatedTime = Math.ceil(questionCount / 2); // 1問30秒と仮定

    // タイトルと説明を設定
    document.getElementById('shared-quiz-title').textContent = title;
    document.getElementById('shared-quiz-description').innerHTML =
        `友達から共有されたクイズです。<br>あなたの知識を試してみましょう！`;
    document.getElementById('shared-quiz-count').textContent = questionCount;
    document.getElementById('shared-quiz-time').textContent = estimatedTime;

    // LP画面を表示
    showScreen('shared-quiz-landing');

    // スタートボタンのイベントリスナーを設定（一度だけ）
    const startBtn = document.getElementById('start-shared-quiz-btn');
    if (startBtn && !startBtn.dataset.listenerAttached) {
        startBtn.dataset.listenerAttached = 'true';
        startBtn.addEventListener('click', () => {
            // クイズを開始
            appState.currentMaterialId = materialId;
            appState.selectedMaterial = materialId;  // 教材フィルター用
            appState.isSharedQuiz = true;  // シェアクイズフラグ
            appState.sharedQuizTitle = title;  // 認定書用
            startQuiz();
        });
    }
}

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // Firebase初期化
    initFirebase();

    // ログイン/ログアウトボタンのイベントリスナー
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (loginBtn) {
        loginBtn.addEventListener('click', signInWithGoogle);
    }
    if (logoutBtn) {
        logoutBtn.addEventListener('click', signOut);
    }

    // 共有URLのチェック（最初に実行）
    // 認定証URLを優先してチェック
    const isCertificate = checkForSharedCertificate();

    // 認定証でない場合は教材共有をチェック
    if (!isCertificate) {
        checkForSharedMaterial();
    }
    // ========================================
    // ホーム画面タブ切り替え
    // ========================================
    document.querySelectorAll('.home-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');

            // すべてのタブボタンとコンテンツから active を削除
            document.querySelectorAll('.home-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.home-tab-content').forEach(c => c.classList.remove('active'));

            // クリックされたタブをアクティブに
            btn.classList.add('active');
            document.getElementById(`tab-${tab}`).classList.add('active');
        });
    });

    // 教材生成タブのPDF/テキスト切り替え
    document.querySelectorAll('.mode-tab-compact').forEach(tab => {
        tab.addEventListener('click', () => {
            const mode = tab.getAttribute('data-mode');

            // タブの切り替え
            document.querySelectorAll('.mode-tab-compact').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // コンテンツの切り替え
            document.querySelectorAll('.input-mode').forEach(m => m.classList.remove('active'));
            document.getElementById(`${mode}-mode`).classList.add('active');
        });
    });

    // 出題数ボタン（コンパクト版）
    document.querySelectorAll('.count-btn-compact').forEach(btn => {
        btn.addEventListener('click', () => {
            const count = parseInt(btn.getAttribute('data-count'));
            appState.questionCount = count;

            // ボタンの選択状態を更新
            document.querySelectorAll('.count-btn-compact').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // 次へボタン
    const nextBtn = document.getElementById('next-question-btn');
    if (nextBtn) {
        nextBtn.addEventListener('click', nextQuestion);
    }

    // ナビゲーションボタン
    const reviewBtn = document.getElementById('review-explanation-btn');
    const skipBtn = document.getElementById('skip-question-btn');

    if (reviewBtn) {
        reviewBtn.addEventListener('click', () => {
            if (appState.previousQuestion) {
                showPreviousExplanation();
            }
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            skipCurrentQuestion();
        });
    }

    // ========================================
    // 共有機能のイベントリスナー
    // ========================================

    // シェアボタン
    const shareBtn = document.getElementById('share-material-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            console.log('Share button clicked, currentMaterialId:', appState.currentMaterialId);

            if (!appState.currentMaterialId) {
                alert('教材が選択されていません。');
                return;
            }

            const modal = document.getElementById('share-modal');
            if (!modal) {
                console.error('Share modal not found');
                return;
            }

            modal.classList.remove('hidden');

            // 結果エリアを非表示にリセット
            document.getElementById('share-result').classList.add('hidden');
            document.getElementById('share-success').classList.add('hidden');
            document.getElementById('qr-code-container').classList.add('hidden');
        });
    } else {
        console.warn('Share button not found in DOM');
    }

    // モーダルを閉じる
    const closeShareModal = document.getElementById('close-share-modal');
    if (closeShareModal) {
        closeShareModal.addEventListener('click', () => {
            document.getElementById('share-modal').classList.add('hidden');
        });
    }

    // モーダル外クリックで閉じる
    const shareModal = document.getElementById('share-modal');
    if (shareModal) {
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                shareModal.classList.add('hidden');
            }
        });
    }

    // URLをコピー
    const copyUrlBtn = document.getElementById('copy-url-btn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', async () => {
            console.log('Copy URL button clicked');
            const materialId = appState.currentMaterialId;

            if (!materialId) {
                console.error('No material selected');
                alert('教材が選択されていません。');
                return;
            }

            // ボタンを無効化してローディング表示
            copyUrlBtn.disabled = true;
            const originalText = copyUrlBtn.querySelector('.share-option-title').textContent;
            copyUrlBtn.querySelector('.share-option-title').textContent = '生成中...';

            try {
                const success = await copyShareURL(materialId);

                if (success) {
                    // 成功メッセージを表示
                    const resultArea = document.getElementById('share-result');
                    const successMsg = document.getElementById('share-success');
                    const qrContainer = document.getElementById('qr-code-container');

                    resultArea.classList.remove('hidden');
                    successMsg.classList.remove('hidden');
                    qrContainer.classList.add('hidden');

                    console.log('URL copied successfully');

                    // 3秒後に成功メッセージを非表示
                    setTimeout(() => {
                        successMsg.classList.add('hidden');
                    }, 3000);
                } else {
                    alert('URLのコピーに失敗しました。');
                }
            } finally {
                // ボタンを元に戻す
                copyUrlBtn.disabled = false;
                copyUrlBtn.querySelector('.share-option-title').textContent = originalText;
            }
        });
    }

    // QRコードを表示
    const showQrBtn = document.getElementById('show-qr-btn');
    if (showQrBtn) {
        showQrBtn.addEventListener('click', async () => {
            console.log('Show QR button clicked');
            const materialId = appState.currentMaterialId;

            if (!materialId) {
                console.error('No material selected');
                alert('教材が選択されていません。');
                return;
            }

            // ボタンを無効化してローディング表示
            showQrBtn.disabled = true;
            const originalText = showQrBtn.querySelector('.share-option-title').textContent;
            showQrBtn.querySelector('.share-option-title').textContent = '生成中...';

            try {
                const resultArea = document.getElementById('share-result');
                const successMsg = document.getElementById('share-success');
                const qrContainer = document.getElementById('qr-code-container');

                resultArea.classList.remove('hidden');
                successMsg.classList.add('hidden');
                qrContainer.classList.remove('hidden');

                // QRコードを生成
                await generateQRCode(materialId);
            } finally {
                // ボタンを元に戻す
                showQrBtn.disabled = false;
                showQrBtn.querySelector('.share-option-title').textContent = originalText;
            }
        });
    }

    // ========================================
    // 認定書画面のイベントリスナー
    // ========================================
    const shareCertBtn = document.getElementById('share-certificate-btn');
    if (shareCertBtn) {
        shareCertBtn.addEventListener('click', () => {
            const { correct, total } = appState.currentSession;
            const accuracy = Math.round((correct / total) * 100);
            const quizTitle = appState.sharedQuizTitle || 'クイズ';
            const materialId = appState.currentMaterialId;

            if (!materialId) {
                alert('共有する教材が見つかりません。');
                return;
            }

            try {
                // クイズスタート画面のURLを生成（認定証ではなく）
                const quizURL = generateShareURL(materialId);

                // 挑戦意欲を高める短縮メッセージ
                // - 簡潔で読みやすい
                // - 競争心を刺激
                // - アクションを促す
                const shareText = `${quizTitle}\n正解率${accuracy}%でした！\n\nあなたは何問解ける？🎯`;

                if (navigator.share) {
                    // Web Share API が使える場合
                    navigator.share({
                        title: quizTitle,
                        text: shareText,
                        url: quizURL
                    }).catch(err => console.log('Share failed:', err));
                } else {
                    // フォールバック: クリップボードにコピー
                    navigator.clipboard.writeText(shareText + '\n\n' + quizURL)
                        .then(() => alert('クイズURLをクリップボードにコピーしました！'))
                        .catch(err => console.error('Copy failed:', err));
                }
            } catch (err) {
                console.error('Failed to generate quiz share URL:', err);
                alert('共有URLの生成に失敗しました。');
            }
        });
    }

    const tryAgainBtn = document.getElementById('try-again-btn');
    if (tryAgainBtn) {
        tryAgainBtn.addEventListener('click', () => {
            // 同じクイズをもう一度
            if (appState.currentMaterialId) {
                startQuiz();
            }
        });
    }

    const createOwnQuizBtn = document.getElementById('create-own-quiz-btn');
    if (createOwnQuizBtn) {
        createOwnQuizBtn.addEventListener('click', () => {
            // ホーム画面に戻る（APIキー設定などを促す）
            appState.isSharedQuiz = false;
            showScreen('home-screen');
            // 教材生成タブに切り替え
            document.querySelector('.home-tab-btn[data-tab="generate"]').click();
        });
    }

    // ========================================
    // メール登録フォーム（認定証画面）
    // ========================================
    const certificateEmailForm = document.getElementById('certificate-email-form');
    if (certificateEmailForm) {
        certificateEmailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('certificate-email-input');
            const email = emailInput.value.trim();

            if (email) {
                // メールアドレスをlocalStorageに保存（本番ではバックエンドに送信）
                const signups = JSON.parse(localStorage.getItem('email_signups') || '[]');
                signups.push({
                    email: email,
                    timestamp: new Date().toISOString()
                });
                localStorage.setItem('email_signups', JSON.stringify(signups));

                // 成功メッセージ
                alert('登録ありがとうございます！\nリリース時にご連絡いたします。');
                emailInput.value = '';

                console.log('Email registered:', email);
                // 本番環境では、ここでバックエンドAPIを呼び出す
                // fetch('/api/signup', { method: 'POST', body: JSON.stringify({ email }) })
            }
        });
    }

    // 認定証画面のプライバシーポリシーリンク
    const certificatePrivacyLink = document.getElementById('certificate-privacy-link');
    if (certificatePrivacyLink) {
        certificatePrivacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            const privacyModal = document.getElementById('privacy-policy-modal');
            if (privacyModal) {
                privacyModal.classList.remove('hidden');
            }
        });
    }

    // ========================================
    // プライバシーポリシーモーダル
    // ========================================
    const privacyLink = document.getElementById('privacy-policy-link');
    const privacyModal = document.getElementById('privacy-policy-modal');
    const closePrivacyBtn = document.getElementById('close-privacy-modal');

    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            privacyModal.classList.remove('hidden');
        });
    }

    if (closePrivacyBtn) {
        closePrivacyBtn.addEventListener('click', () => {
            privacyModal.classList.add('hidden');
        });
    }

    // モーダル外クリックで閉じる
    if (privacyModal) {
        privacyModal.addEventListener('click', (e) => {
            if (e.target === privacyModal) {
                privacyModal.classList.add('hidden');
            }
        });
    }

    // ========================================
    // データ完全リセット
    // ========================================
    const resetAllDataBtn = document.getElementById('reset-all-data-btn');
    if (resetAllDataBtn) {
        resetAllDataBtn.addEventListener('click', () => {
            const confirmed = confirm(
                '⚠️ 警告\n\nすべての教材、問題、学習履歴が完全に削除されます。\nこの操作は取り消せません。\n\n本当にリセットしますか？'
            );

            if (confirmed) {
                const doubleConfirmed = confirm(
                    '最終確認\n\nすべてのデータを削除して、アプリを初期状態に戻します。\nよろしいですか？'
                );

                if (doubleConfirmed) {
                    // localStorageを完全にクリア
                    localStorage.clear();

                    // アプリの状態をリセット
                    appState.materials = [];
                    appState.questions = [];
                    appState.userStats = {
                        totalAnswered: 0,
                        totalCorrect: 0,
                        streak: 0,
                        lastStudyDate: null
                    };

                    alert('✅ すべてのデータが削除されました。\nページをリロードします。');

                    // ページをリロード
                    window.location.reload();
                }
            }
        });
    }

    initHomeScreen();
    updateReportTab();
});

// ========================================
// 問題のアーカイブ/削除
// ========================================
function archiveQuestion(questionId, materialId) {
    const question = appState.questions.find(q => q.id === questionId);
    if (!question) return;

    if (!confirm(`この問題をアーカイブしますか？\n\nアーカイブされた問題は出題されなくなります。`)) {
        return;
    }

    // アーカイブフラグを追加
    question.archived = true;
    saveQuestions();

    // 教材詳細を再表示
    showMaterialDetail(materialId);
    alert('問題をアーカイブしました');
}

function deleteQuestion(questionId, materialId) {
    const question = appState.questions.find(q => q.id === questionId);
    if (!question) return;

    const confirmMessage = `この問題を削除しますか？\n\n問題: ${question.question}\n\nこの操作は取り消せません。`;
    if (!confirm(confirmMessage)) {
        return;
    }

    // 問題を削除
    appState.questions = appState.questions.filter(q => q.id !== questionId);
    saveQuestions();

    // 教材詳細を再表示
    showMaterialDetail(materialId);
    alert('問題を削除しました');
}
