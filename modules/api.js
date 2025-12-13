import { appState } from './state.js';
import { saveQuestions, saveMaterials, saveMaterialToCloud, saveQuestionToCloud } from './storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI } from './ui.js';

export function updateGeneratingStatus(message, progress) {
    const statusEl = document.getElementById('generating-status');
    const fillEl = document.getElementById('progress-fill');
    if (statusEl) statusEl.textContent = message;
    if (fillEl) fillEl.style.width = progress + '%';
}

// Convert text to Markdown
export async function convertTextToMarkdown(text) {
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

// Generate Material Metadata
export async function generateMaterialMetadata(text, fileName) {
    const maxChars = 6000;
    const truncatedText = text.slice(0, maxChars);

    const prompt = `以下のテキストを分析して、魅力的な学習教材としてのメタデータを生成してください。

要件:
1. **タイトル**: 教材の内容を表すキャッチーで興味を引くタイトル（20文字以内）
2. **要約**: 教材の魅力を伝える説明文（100文字以内）
3. **タグ**: 具体的なキーワード（3-5個）
4. JSON形式で出力

出力形式:
{
  "title": "タイトル",
  "summary": "要約",
  "tags": ["タグ1", "タグ2"]
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
                    content: 'あなたは教育マーケティングの専門家です。'
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
        return {
            title: fileName.replace(/\.[^/.]+$/, ''),
            summary: '説明を生成できませんでした。',
            tags: ['未分類']
        };
    }

    const data = await response.json();
    try {
        return JSON.parse(data.choices[0].message.content);
    } catch (e) {
        return {
            title: fileName.replace(/\.[^/.]+$/, ''),
            summary: '説明を生成できませんでした。',
            tags: ['未分類']
        };
    }
}

// Generate Questions
export async function generateQuestionsWithAI(text, fileName, questionCount = 30) {
    const maxChars = 12000;
    const truncatedText = text.slice(0, maxChars);

    const prompt = `以下のテキストから${questionCount}問のクイズを生成してください。

【クイズの目標】
学習者が「なるほど！」と思い、次の日も覚えている問題を作る。

【形式】
- 1問1概念
- 答えを直接示唆しない
- 難易度: 基礎50%, 応用50%

出力形式（JSON）:
{
  "questions": [
    {
      "question": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctIndex": 0,
      "explanation": "解説文",
      "difficulty": "basic",
      "sourceSection": "関連セクション",
      "tags": ["タグ"]
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
                    content: 'あなたは優秀なクイズ作成者です。JSON形式で出力してください。'
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
        throw new Error('API呼び出しに失敗しました');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);
    const questions = parsed.questions || [];

    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('クイズが生成されませんでした');
    }

    return questions; // Raw questions, styling/IDs handled by caller
}

// Generate Image Prompt
export async function generateImagePrompt(question, choices, correctAnswer) {
    const prompt = `クイズ問題に関連する「写真で一言」風のシュールで面白い写真のプロンプトを生成してください。
【問題】${question}
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

    if (!response.ok) throw new Error('画像プロンプト生成失敗');
    const data = await response.json();
    return data.choices[0].message.content.trim();
}

// DALL-E Generation
export async function generateImageWithDALLE(imagePrompt) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.apiKey}`
        },
        body: JSON.stringify({
            model: 'dall-e-3',
            prompt: `${imagePrompt}. Style: realistic stock photo, natural lighting, candid moment, slightly absurd or surreal situation. No text or letters.`,
            n: 1,
            size: '1024x1024',
            quality: 'standard'
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '画像生成失敗');
    }
    const data = await response.json();
    return data.data[0].url;
}

// PDF Text Extraction
export async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    // pdfjsLib is global
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 300);

    for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';

        updateGeneratingStatus(`PDFを読み込んでいます... (${i}/${maxPages}ページ)`, Math.round((i / maxPages) * 20));
    }
    return fullText;
}

// Fetch URL with Fallback Proxies
export async function fetchTextFromUrl(url) {
    // List of proxies with custom handlers
    const proxies = [
        {
            name: 'CodeTabs',
            getUrl: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
            extract: async (res) => await res.text()
        },
        {
            name: 'AllOrigins (JSON)',
            getUrl: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            extract: async (res) => {
                const data = await res.json();
                return data.contents;
            }
        },
        {
            name: 'CorsProxy',
            getUrl: (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
            extract: async (res) => await res.text()
        }
    ];

    let lastError;

    for (const proxy of proxies) {
        try {
            const proxyUrl = proxy.getUrl(url);
            console.log(`Trying proxy: ${proxy.name} (${proxyUrl})`);

            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Status ${response.status}`);

            const html = await proxy.extract(response);

            if (!html || html.length < 50) throw new Error('Empty response');

            // Success - parse HTML
            // Note: DOMParser might fail on some complex documents but essentially works for extraction
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            doc.querySelectorAll('script, style, nav, header, footer, aside, iframe, noscript').forEach(el => el.remove());
            const mainContent = doc.querySelector('article') || doc.querySelector('main') || doc.body;

            let text = mainContent.innerText || mainContent.textContent;
            text = text.replace(/\s+/g, ' ').trim();

            if (text.length < 100) throw new Error('Insufficient content extracted');

            return text.slice(0, 15000);

        } catch (e) {
            console.warn(`Proxy ${proxy.name} failed:`, e);
            lastError = e;
            continue; // Try next proxy
        }
    }

    throw new Error(`URLの読み込みに失敗しました。以下の原因が考えられます：\n1. サイトがアクセスをブロックしている\n2. URLが間違っている\n3. プロキシサービスが混雑している\n\n別のURLを試すか、テキストを直接コピー＆ペーストしてください。`);
}

export async function generateImagesForQuestions(questions) {
    if (!document.getElementById('image-gen-checkbox')?.checked) return;

    // Limit to 5 questions to save API costs/time
    const targetQuestions = questions.slice(0, 5);
    let completed = 0;

    for (const q of targetQuestions) {
        try {
            updateGeneratingStatus(`画像を生成中... (${completed + 1}/${targetQuestions.length})`, 80 + (completed / targetQuestions.length) * 20);

            const prompt = await generateImagePrompt(q.question, q.choices, q.choices[q.correctIndex]);
            const imageUrl = await generateImageWithDALLE(prompt);

            q.imageUrl = imageUrl;
            q.imagePrompt = prompt;
            completed++;

            // Save incrementally
            saveQuestions();
        } catch (e) {
            console.error('Image generation failed for question:', q.id, e);
        }
    }
}

export async function generateQuizFromText(text, sourceName) {
    try {
        if (!appState.apiKey) return;

        showScreen('generating-screen');
        updateGeneratingStatus('テキストを解析しています...', 20);

        const metadata = await generateMaterialMetadata(text, sourceName);
        updateGeneratingStatus('学習用コンテンツを整形しています...', 40);
        const markdownContent = await convertTextToMarkdown(text);

        updateGeneratingStatus('クイズを作成しています...', 60);

        const questions = await generateQuestionsWithAI(text, sourceName, appState.questionCount || 10);

        const materialId = 'mat_' + Date.now();
        const newMaterial = {
            id: materialId,
            title: metadata.title,
            summary: metadata.summary,
            content: markdownContent, // Saved as Markdown
            tags: metadata.tags,
            fileName: sourceName,
            uploadDate: new Date().toISOString(),
            questionIds: [],
            isShared: false
        };

        const newQuestions = questions.map((q, idx) => ({
            id: Date.now() + idx,
            ...q,
            materialId: materialId,
            lastReviewed: null,
            reviewCount: 0,
            easeFactor: 2.5,
            interval: 0,
            nextReview: null
        }));

        newMaterial.questionIds = newQuestions.map(q => q.id);

        appState.materials.push(newMaterial);
        appState.questions.push(...newQuestions);
        saveMaterials();
        saveQuestions();

        // Cloud Sync: Save new material and questions
        await saveMaterialToCloud(newMaterial);
        for (const q of newQuestions) {
            await saveQuestionToCloud(q);
        }

        updateGeneratingStatus('関連画像を生成しています...', 90);
        await generateImagesForQuestions(newQuestions);

        showScreen('home-screen');
        alert('クイズ生成完了！');

    } catch (e) {
        console.error(e);
        alert('生成失敗: ' + e.message);
        showScreen('home-screen');
    }
}

export async function generateQuizFromUrl(url) {
    try {
        showScreen('generating-screen');
        updateGeneratingStatus('URLから本文を抽出しています...', 10);

        const text = await fetchTextFromUrl(url);
        await generateQuizFromText(text, url);

    } catch (e) {
        console.error(e);
        alert('URLからの生成失敗: ' + e.message);
        showScreen('home-screen');
    }
}
