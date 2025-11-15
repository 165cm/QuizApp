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

    // タグクラウドを生成
    sortedTags.forEach(tag => {
        const stat = tagStats[tag];
        const correctCount = stat.correct;
        const totalCount = stat.total;

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

【最重要】記憶に定着する、深い理解につながるクイズを作成すること！

## 問題文の作成方針:
### 必須要素（すべての問題に含めること）:
1. **具体的な使用例・応用場面**: 「実際にどう使われているか」を示す
   - 例：「Webアプリでユーザー認証を実装する際に...」「データベース設計で複数のテーブルを...」
2. **記憶のフック**: 覚えやすいイメージ、比喩、語呂合わせ、ストーリー
   - 例：「"グローバル変数"は家の中のどこからでも見える時計のようなもの」
3. **ヒントや関連づけ**: 既知の概念との接点、名前の由来、覚え方
   - 例：「名前の"Closure"は"閉じ込める"という意味から来ています」
4. **Why（なぜそうなのか）**: 単なる「何」ではなく「なぜ重要か」「なぜそう設計されているか」
   - 例：「なぜ非同期処理が必要かというと、画面が固まらないように...」

### 問題文の構成（3-4文）:
- 1文目: 具体的なシチュエーション・使用例
- 2文目: 覚えやすいイメージや比喩
- 3文目: 実際の問い（選択肢を選ぶ）
- （オプション）ヒント: 「ヒント：○○という意味です」

例：❌「光合成を行う細胞小器官は？」
    ✅「植物が太陽の光を"食べ物"に変える魔法の工場。この工場は、もともと別の生物だったものが数十億年前に植物の祖先の中に住み着いたという驚きの歴史があります。葉っぱが緑色なのは、この小器官がぎっしり詰まっているから。さて、この"体内発電所"の名前は？（ヒント：「緑色の体」という意味です）」

## 解説文の作成方針:
### 必須要素（すべての解説に含めること）:
1. **正解の深い理由**: 表面的な説明ではなく、「なぜそうなのか」の本質
2. **次の疑問への先回り回答**: 読者が「じゃあ○○は？」と思う疑問を予測して答える
   - 例：「では、関数外の変数にアクセスできないローカル変数との違いは何でしょうか？実は...」
3. **実践的な知識**: 「実際の開発でどう使うか」「よくある失敗とその対策」
4. **歴史・語源・エピソード**: 記憶に残る背景情報
5. **間違い選択肢の罠の解説**: 「なぜ〇〇と間違えやすいか」を明示

### 解説文の構成（3-5文、200-300文字厳守）:
**重要**: 10秒で読み切れる量にすること！文字数は200-300文字以内に収める。
- 1文目: 正解の確認と基本的な説明（語源やイメージ）
- 2-3文目: 最も重要な洞察を1つ（深い理由、歴史、実践的知識のいずれか）
- 4文目: 次に疑問に思うことへの先回り回答、またはよくある間違いの指摘
- 5文目: 記憶に残るまとめ（覚え方のヒントや発展的なポイント）

例：❌「葉緑体です。」（簡素すぎ）
    ❌「正解は葉緑体（chloroplast）です！この名前は"chloro（緑）"と"plast（形成体）"から来ています。葉緑体の最も驚くべき事実は、もともと独立したシアノバクテリアという生物だったこと。約15億年前、植物の祖先がこのバクテリアを"飲み込んだ"のですが、消化せずに共生関係を築いたのです（これを内部共生説と言います）。では、動物にはなぜ葉緑体がないのでしょう？実は、一部のウミウシは葉緑体を取り込んで光合成する能力を持っているんです！「ミトコンドリア」と間違えやすいのですが、ミトコンドリアは"エネルギーを使う"器官、葉緑体は"エネルギーを作る"器官と覚えましょう。現在でも葉緑体は独自のDNAを持ち、細胞分裂とは別に自己増殖する、まさに"細胞内の居候"なのです！」（長すぎ、約350文字）
    ✅「正解は葉緑体（chloroplast）です！名前は"chloro（緑）"+"plast（形成体）"から。実はもともと独立したシアノバクテリアで、15億年前に植物の祖先に取り込まれました（内部共生説）。「ミトコンドリア」と混同しやすいですが、ミトコンドリアは"エネルギーを使う"器官、葉緑体は"エネルギーを作る"器官です。独自のDNAを持ち、細胞内で自己増殖する"居候"として今も生き続けています！」（約200文字）

## その他の要件:
1. まずテキストを分析して、主要な見出し（セクション、章、トピック）を検出
2. 各見出しセクションから問題を生成し、対応する見出しを記録
3. 難易度: 基礎(10問)、標準(10問)、応用(10問)
4. **選択肢の工夫**: 正解以外は「実際によくある間違い」「混同しやすい概念」を選ぶ
   - 単なるダミーではなく、「なぜそう間違えるのか」が説明できる選択肢に
5. 各問題に5つ程度の関連タグを付与（実用的で検索しやすいタグ）
6. JSON形式で出力

出力形式:
{
  "sections": [
    {
      "heading": "見出し1",
      "level": 1
    }
  ],
  "questions": [
    {
      "question": "具体例+イメージ+ヒント付きの問題文（3-4文、記憶のフックを含む）",
      "choices": ["選択肢1（正解）", "選択肢2（よくある誤解）", "選択肢3（混同しやすい概念）", "選択肢4（似た名前の別物）"],
      "correctIndex": 0,
      "explanation": "深い洞察を含む解説文（3-5文、200-300文字厳守、10秒で読み切れる量）",
      "difficulty": "basic",
      "sourceSection": "見出し1",
      "tags": ["実用的タグ1", "タグ2", "タグ3", "タグ4", "タグ5"]
    }
  ]
}

注意:
- sourceSectionは必ずsectionsのheadingと一致させること
- すべての問題に必ずsourceSectionとtagsを含めること
- **最重要**: 解説は200-300文字厳守（10秒で読み切れる量）
- 解説は「いいですね！」「素晴らしい！」などの表面的な励ましではなく、学習者が「なるほど！」「そういうことか！」と腑に落ちる深い洞察を提供すること
- 問題文には必ず「具体的な使用例」と「記憶のフック」を含めること
- 解説には必ず「次に疑問に思うであろうこと」への先回り回答、またはよくある間違いの指摘を含めること

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
                    content: 'あなたは、記憶定着と深い理解を促進する学習コンテンツの専門家です。あなたの使命は、学習者が「なるほど！そういうことか！」と腑に落ち、知識が長期記憶に定着するクイズを作ることです。\n\n重要な原則：\n1. 問題文には必ず「具体的な使用例」「覚えやすいイメージ」「ヒント」を含める\n2. 解説では「次に疑問に思うであろうこと」を先回りして答える\n3. 表面的な励まし（「いいですね！」「素晴らしい！」）ではなく、深い洞察と実践的知識を提供する\n4. 語源、歴史、エピソードなど記憶のフックを豊富に盛り込む\n5. 間違い選択肢は「よくある誤解」を反映し、解説でなぜ間違えやすいかを説明する\n\n学習者が読んだ後に「これは役に立つ！」「面白い！」「忘れられない！」と感じる内容を作成してください。'
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

    // 選択肢表示
    const container = document.getElementById('choices-container');
    container.innerHTML = '';
    question.choices.forEach((choice, index) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = `${index + 1}. ${choice}`;  // 番号を追加
        btn.onclick = () => selectChoice(index);
        container.appendChild(btn);
    });

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
}

// 自動進行用のタイマーID
let autoProgressTimer = null;

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
    const isCorrect = appState.selectedAnswer === question.correctIndex;

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
        if (i === question.correctIndex) {
            btn.classList.add('correct');
        } else if (i === appState.selectedAnswer && !isCorrect) {
            btn.classList.add('incorrect');
        }
    });

    // フィードバックモーダル表示
    const feedbackModal = document.getElementById('feedback-modal');
    const icon = document.getElementById('feedback-icon');
    const title = document.getElementById('feedback-title');
    const explanation = document.getElementById('feedback-explanation');
    const timer = document.getElementById('feedback-timer');

    // 正解の選択肢を表示
    const correctChoice = question.choices[question.correctIndex];
    const correctChoiceText = `${question.correctIndex + 1}. ${correctChoice}`;

    if (isCorrect) {
        icon.textContent = '🎉';
        title.textContent = correctChoiceText;
        title.style.color = '#10b981';
    } else {
        icon.textContent = '💡';
        title.textContent = correctChoiceText;
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

        // 参照元セクションのアンカーリンクを生成
        const anchorId = 'heading-' + encodeURIComponent(sectionTag.replace(/\s+/g, '-'));
        const sectionLink = `<a href="#${anchorId}" class="section-link" onclick="highlightHeading('${anchorId}'); return false;">🏷️ ${sectionTag}</a>`;

        questionCard.innerHTML = `
            <div class="question-item-header">
                <span class="question-number">Q${index + 1}</span>
                ${difficultyBadge}
            </div>
            <div class="question-item-text">${q.question}</div>
            <div class="question-item-meta">
                <span class="section-tag">${sectionLink}</span>
                <span class="last-reviewed">最終学習: ${lastReviewed}</span>
            </div>
        `;

        container.appendChild(questionCard);
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
    // Callout風の装飾を追加
    const formattedContent = content
        .split('\n')
        .map(line => {
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
            } else if (line.startsWith('> ')) {
                // Callout風のブロック引用
                const text = line.substring(2);
                return `<div class="content-callout">${text}</div>`;
            } else if (line.startsWith('- ') || line.startsWith('* ')) {
                // リスト項目
                const text = line.substring(2);
                return `<div class="content-list-item">• ${text}</div>`;
            } else if (line.trim() === '') {
                return '<br>';
            } else if (line.includes('**') && line.match(/\*\*(.*?)\*\*/)) {
                // 太字をハイライト
                const highlighted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="content-highlight">$1</strong>');
                return `<p>${highlighted}</p>`;
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
            explanation: q.explanation,
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

    // URL長の警告
    if (shareURL.length > 2000) {
        console.warn(`⚠️ Share URL is ${shareURL.length} characters (recommended < 2000). Some browsers may have issues.`);
        if (shareURL.length > 8000) {
            throw new Error(`共有URLが長すぎます（${shareURL.length}文字）。問題数を減らしてください。`);
        }
    }

    console.log(`Share URL generated: ${shareURL.length} characters`);
    return shareURL;
}

/**
 * URLをクリップボードにコピー（LZ-string圧縮使用）
 */
function copyShareURL(materialId) {
    try {
        const url = generateShareURL(materialId);
        navigator.clipboard.writeText(url);
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

    // 教材を追加（タイトルに「(共有)」を付加）
    const newMaterial = {
        id: newMaterialId,
        title: shareData.material.title + ' (共有)',
        summary: shareData.material.summary,
        // contentがない場合は要約から生成
        content: shareData.material.content || `# ${shareData.material.title}\n\n${shareData.material.summary}\n\n*この教材は共有URLからインポートされたため、元の本文は含まれていません。*`,
        tags: shareData.material.tags,
        fileName: shareData.material.fileName,
        uploadDate: new Date().toISOString(),
        questionIds: []
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

        // データをインポート
        const newMaterialId = importSharedMaterial(shareData);

        // URLをクリーンアップ（ブラウザ履歴を汚さない）
        window.history.replaceState({}, document.title, window.location.pathname);

        // 教材詳細画面を表示
        showMaterialDetail(newMaterialId);
        showScreen('material-detail-screen');

        // 成功メッセージ
        alert(`「${shareData.material.title}」をインポートしました！\n問題数: ${shareData.questions.length}問`);
    } catch (err) {
        console.error('Failed to import shared material:', err);
        console.error('Error details:', err.message, err.stack);
        alert(`共有データの読み込みに失敗しました。\n\nエラー: ${err.message}\n\nURLが正しいか確認してください。`);

        // エラー時もURLをクリーンアップ
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    // 共有URLのチェック（最初に実行）
    checkForSharedMaterial();
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

    initHomeScreen();
    updateReportTab();
});
