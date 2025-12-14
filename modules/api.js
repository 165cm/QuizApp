import { appState } from './state.js';
import { saveQuestions, saveMaterials, saveMaterialToCloud, saveQuestionToCloud, uploadImage } from './storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI, startMiniReview, stopMiniReview, signalQuizReady } from './ui.js';
import { DEFAULT_PROMPTS, ImagePromptHelper, GachaEngine } from './default_prompts.js';



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

    // Use Template
    let prompt = DEFAULT_PROMPTS.markdownConversion;
    prompt = prompt.replace('{{text}}', truncatedText);

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

// Analyze Learning Content (Step 1)
async function analyzeLearningContent(text) {
    const maxChars = 6000;
    const truncatedText = text.slice(0, maxChars);

    let prompt = DEFAULT_PROMPTS.contentAnalysis;
    prompt = prompt.replace('{{text}}', truncatedText);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${appState.apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'あなたは教育カリキュラムの専門家です。' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.5,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) throw new Error('学習コンテンツの分析に失敗しました');
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

// Generate Material Metadata
export async function generateMaterialMetadata(text, fileName) {
    const maxChars = 6000;
    const truncatedText = text.slice(0, maxChars);

    // Use Template
    let prompt = DEFAULT_PROMPTS.metadataGeneration;
    prompt = prompt.replace('{{text}}', truncatedText);

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
export async function generateQuestionsWithAI(text, fileName, questionCount = 30, customSettings = null) {
    const maxChars = 12000;
    const truncatedText = text.slice(0, maxChars);

    // Get Settings (Merge Custom with Default)
    const defaults = appState.quizSettings || { targetLevel: '一般', customInstructions: '特になし' };
    const level = customSettings?.targetLevel || defaults.targetLevel || '一般';
    const instructions = customSettings?.customInstructions || defaults.customInstructions || '特になし';
    const outputLang = customSettings?.outputLanguage || '日本語';

    // Build Prompt from Template
    let prompt = DEFAULT_PROMPTS.questionGeneration;
    prompt = prompt.replace('{{count}}', questionCount);
    prompt = prompt.replace('{{level}}', level);
    prompt = prompt.replace('{{instructions}}', instructions);
    prompt = prompt.replace('{{text}}', truncatedText);

    // Context Injection
    let contextStr = '特になし';
    if (customSettings?.context) {
        const c = customSettings.context;
        contextStr = `
- ターゲット読者: ${c.audience}
- 学習目標: ${c.goals.join(', ')}
- キーコンセプト: ${c.concepts.join(', ')}
- トーン: ${c.tone}
`;
    }
    prompt = prompt.replace('{{context}}', contextStr);

    // Language instruction
    const langInstruction = outputLang === 'auto'
        ? 'ソーステキストと同じ言語で出力してください。'
        : `出力は必ず${outputLang}で生成してください。`;

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
                    content: `あなたは優秀なクイズ作成者です。JSON形式で出力してください。${langInstruction}`
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

// Helper to generate prompts for questions using GachaEngine (no API calls, variety!)
function generatePromptsForBatch(questions, context) {
    const category = context?.category || 'life';

    // Use GachaEngine for varied, non-repetitive prompts
    return GachaEngine.generateBatch(questions, category);
}



// Helper to generate Rank Image Ideas (コスプレ博士 template)
async function generateRankPrompts(context) {
    const topic = context ? context.topic : 'General Knowledge';
    const sourceText = context ? context.sourceText?.substring(0, 500) : '';

    const systemPrompt = `あなたは画像生成AIのプロンプト作成者です。
以下のクイズソースを分析し、「コスプレ博士」キャラクターの画像生成プロンプトを3段階分作成してください。

【クイズソース】
テーマ: ${topic}
${sourceText}

【キャラクター固定設定】
- 小柄な老博士（白衣、アインシュタイン風ボサボサ白髪、丸眼鏡、大きな鼻）
- アートスタイル：Pixar風3DCGカートゥーン、明るくポップな色彩
- 正方形構図、キャラクター中央配置

【あなたのタスク】
1. ソースからテーマを特定
2. そのテーマを象徴するコスプレ衣装・小道具を決定
3. 以下3段階のプロンプトを生成

【ランク別ルール】
■ 高ランク「神博士」(prompts[0])
- 完璧すぎるコスプレ（本家超え、オーラ発光）
- ドヤ顔、目がキラキラ
- 背景：金色の光、紙吹雪、豪華

■ 中ランク「一人前博士」(prompts[1])
- コスプレ70%成功（惜しいポイントあり）
- 少し自信ある表情
- 背景：普通の明るさ、小さな拍手

■ 低ランク「見習い博士」(prompts[2])
- コスプレ失敗（サイズ合わない、アイテム逆さま、手作り感満載）
- 困った表情、冷や汗
- 背景：薄暗め、失敗を暗示

【出力形式】
JSON: {"prompts": ["高ランク英語プロンプト80語以内", "中ランク英語プロンプト80語以内", "低ランク英語プロンプト80語以内"]}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${appState.apiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant. Output JSON only.' },
                    { role: 'user', content: systemPrompt }
                ],
                temperature: 0.8,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) throw new Error('Rank prompt gen API error');

        const data = await response.json();
        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);

        let results = [];
        if (Array.isArray(parsed)) results = parsed;
        else if (parsed.prompts) results = parsed.prompts;
        else if (parsed.ranks) results = parsed.ranks;
        else results = Object.values(parsed).slice(0, 3);

        if (results.length < 3) throw new Error('Not enough rank prompts generated');
        return results.slice(0, 3).map(r => r + " Pixar 3D cartoon style, square composition, vibrant colors.");

    } catch (e) {
        console.warn('Rank prompt gen failed, using fallback', e);
        // Fallback with コスプレ博士 theme
        return [
            `Pixar 3D cartoon. Tiny elderly professor (Einstein-like white messy hair, round glasses, lab coat) in PERFECT ${topic} cosplay, glowing golden aura, confetti, triumphant pose, sparkling eyes, luxurious background.`,
            `Pixar 3D cartoon. Tiny elderly professor (Einstein-like white messy hair, round glasses, lab coat) in 70% successful ${topic} cosplay, slight confident smile, subtle applause, bright background.`,
            `Pixar 3D cartoon. Tiny elderly professor (Einstein-like white messy hair, round glasses, lab coat) in FAILED ${topic} cosplay, costume too big, items upside down, sweating, embarrassed expression, dim background.`,
        ];
    }
}

export async function generateImagesForQuestions(questions) {


    const checkbox = document.getElementById('image-gen-checkbox');


    const useImageGen = checkbox?.checked;
    if (!useImageGen) {

        return;
    }

    // Filter questions that don't have images yet
    const targetQuestions = questions.filter(q => !q.imageUrl);

    if (targetQuestions.length === 0) {

        return;
    }


    // Group into batches of 9 (since we have 12 slots: 9 questions + 3 ranks)
    // If we have more than 9 questions, we might need multiple sheets, but effectively we only support 10-question quizzes usually.
    // For simplicity, let's take the first 9 questions for the main grid. 10th+ will have to share or no image.
    // Ideally we iterate.
    const BATCH_SIZE = 9;
    const batches = [];
    for (let i = 0; i < targetQuestions.length; i += BATCH_SIZE) {
        batches.push(targetQuestions.slice(i, i + BATCH_SIZE));
    }

    let batchNum = 0;

    for (const batch of batches) {
        try {
            batchNum++;
            updateGeneratingStatus(`画像を生成中... (${batchNum}/${batches.length})`, 80 + (batchNum / batches.length) * 15);

            // 1. Generate prompts for this batch (Questions)
            // Retrieve context from first question if available
            const context = batch[0].contextData || null;
            const prompts = generatePromptsForBatch(batch, context);


            // 2. Add Rank Prompts (3 slots) to make 12 total
            // Rank S (High), Rank A (Mid), Rank B (Low)
            // request dynamic humorous prompts from AI
            let rankPrompts = [];
            try {
                rankPrompts = await generateRankPrompts(context);
            } catch (err) {
                console.warn('Rank prompt gen failed, using fallback', err);
                const topic = context ? context.topic : 'Learning';
                rankPrompts = [
                    `Funny exaggerated illustration of 'Ultimate Master of ${topic}'. God-like figure, epic universe background. Text: 'GOD TIER'`,
                    `Illustration of 'Smart Expert of ${topic}'. Professor looking confident with trophy. Text: 'EXPERT'`,
                    `Funny illustration of 'Novice of ${topic}'. Confused cute character trying to understand. Text: 'NOVICE'`
                ];
            }
            prompts.push(...rankPrompts);

            // 3. Create Grid Prompt (4x3 = 12 panels)
            let gridPrompt = "Create a single image with a 4x3 grid layout (12 panels). Each panel has white background with thin white separator lines between panels. The image should be in 16:9 aspect ratio (so each panel is roughly 4:3). Each panel contains a distinct centered illustration. ";

            prompts.forEach((p, idx) => {
                gridPrompt += `Panel ${idx + 1}: ${p}. `;
            });
            // Fill remaining panels if batch is small (unlikely for 10q quiz but possible)
            for (let i = prompts.length; i < 12; i++) {
                gridPrompt += `Panel ${i + 1}: abstract minimalist pattern. `;
            }
            gridPrompt += "Style: cohesive, consistent lighting, realistic or illustrative as per context. High quality.";

            // 4. Generate single grid image (Base64)
            const base64Image = await generateGridImage(gridPrompt);

            // 5. Upload to Supabase Storage (if logged in)
            let finalImageUrl = base64Image; // Fallback to base64 if upload fails or not logged in

            // We need a materialId. If batch[0] has one, use it.
            const materialId = batch[0].materialId || 'temp_' + Date.now();

            // Import uploadImage dynamically or assume it's available via module? 
            // Since api.js imports from storage.js usually... 
            // Wait, api.js might not import uploadImage yet. We need to check imports.
            // But let's assume we will add it to imports.

            // To avoid circular dependency issues if any, we might need to be careful.
            // api.js imports: import { appState } ... 
            // storage.js imports: appState

            // Let's check imports in api.js first. 
            // Assuming we added it to the imports in api.js by ourselves or will do it.
            // I will assume `import { ... } from './storage.js'` exists and I'll add uploadImage to it.

            if (appState.currentUser) {
                updateGeneratingStatus(`画像をクラウドに保存中... (${batchNum}/${batches.length})`, 85);
                const cloudUrl = await uploadImage(base64Image, materialId);
                if (cloudUrl) {
                    finalImageUrl = cloudUrl;

                } else {
                    console.warn('🖼️ Upload failed, using Base64 fallback (Local Storage warning)');
                    // If fallback, we risk quota error.
                }
            }

            // 6. Assign to questions
            const newQuestions = [];
            batch.forEach((q, idx) => {
                q.imageUrl = finalImageUrl;
                q.imagePrompt = prompts[idx];
                q.imageGridIndex = idx; // 0-8
                newQuestions.push(q);
            });

            // Store Rank Image Indices in the questions? 
            // Better: Store it in the material data? But `questions` are what we iterate.
            // Let's store special `rankGridIndices` in the first question to retrieve later? 
            // Or just convention: 9, 10, 11 are always Ranks if grid exists.
            // We will rely on convention in game.js.

            // Force Cloud Sync for images (Prioritize Cloud)
            if (appState.currentUser) {
                for (const q of newQuestions) {
                    await saveQuestionToCloud(q);
                }
            }

            // Save locally
            try {
                saveQuestions();
            } catch (quotaError) {
                console.warn('Local Storage Quota Exceeded:', quotaError);
            }

        } catch (e) {
            console.error('Grid image generation failed:', e);
        }
    }
}

// Generate a single grid image using selected model
// Generate a single grid image (Always Google Nano Banana Pro)
async function generateGridImage(gridPrompt) {
    return await generateGridImageWithGoogle(gridPrompt);
}

// Google grid image generation using Gemini 3 Pro Image (Nano Banana Pro)
async function generateGridImageWithGoogle(gridPrompt, retryCount = 0) {
    if (!appState.googleApiKey) throw new Error('Google APIキーが設定されていません');

    // Use Gemini 3 Pro Image (Nano Banana Pro) as requested
    const modelName = 'gemini-3-pro-image-preview';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${appState.googleApiKey}`;



    try {
        const requestBody = {
            contents: [{
                parts: [{ text: gridPrompt }]
            }],
            generationConfig: {
                responseModalities: ["IMAGE"]
                // Note: imageGenerationConfig is not supported by gemini-3-pro-image-preview
                // The generated image will use default aspect ratio
            }
        };



        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });



        if (response.status === 429) {
            // Even with paid plan, rate limits exist (quota). Exponential backoff.
            if (retryCount < 2) {
                console.warn('Rate limit exceeded (429). Retrying in 5 seconds...');
                await new Promise(resolve => setTimeout(resolve, 5000));
                return generateGridImageWithGoogle(gridPrompt, retryCount + 1);
            }
            throw new Error('Google APIのレート制限（または課金上限）を超えました。お支払い設定を確認するか、しばらく待ってから再試行してください。');
        }

        if (!response.ok) {
            const error = await response.json();
            console.error('🖼️ API Error:', JSON.stringify(error));
            throw new Error(error.error?.message || '画像生成失敗 (Gemini)');
        }

        const data = await response.json();


        // Find image part in response
        const candidates = data.candidates || [];
        for (const candidate of candidates) {
            const parts = candidate.content?.parts || [];
            for (const part of parts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {

                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        }

        console.error('🖼️ No image in response. Candidates:', JSON.stringify(candidates));
        throw new Error('画像データが取得できませんでした');
    } catch (e) {
        console.error("🖼️ Gemini Image Gen Error:", e);
        throw e;
    }
}


export async function generateQuizFromText(text, sourceName, customSettings = null) {
    try {
        if (!appState.apiKey) {
            alert('OpenAI APIキーが設定されていません。設定画面からAPIキーを入力してください。');
            return;
        }

        showScreen('generating-screen');
        startMiniReview();
        updateGeneratingStatus('テキストを解析しています...', 20);

        const metadata = await generateMaterialMetadata(text, sourceName);
        updateGeneratingStatus('学習用コンテンツを整形しています...', 40);
        const markdownContent = await convertTextToMarkdown(text);

        updateGeneratingStatus('AIが学習内容を分析しています...', 30);
        const analysisContext = await analyzeLearningContent(text);

        // Merge analysis into settings for passing to question generator
        const genSettings = { ...customSettings, context: analysisContext };

        updateGeneratingStatus('クイズを作成しています... (分析完了)', 60);

        // Check Image Gen setting
        const useImageGen = document.getElementById('image-gen-checkbox')?.checked;
        let qCount = appState.questionCount || 10;

        // Limit to 9 for cost saving (1 API call = 9 grid images) if image gen is ON
        if (useImageGen && qCount > 9) {
            qCount = 9;
        }

        const questions = await generateQuestionsWithAI(text, sourceName, qCount, genSettings);

        // Attach context to questions for image generation usage
        questions.forEach(q => q.contextData = analysisContext);

        // Use standard UUID if available, otherwise simple fallback (though Supabase prefers UUID)
        const materialId = crypto.randomUUID ? crypto.randomUUID() : 'mat_' + Date.now();
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
            id: crypto.randomUUID ? crypto.randomUUID() : (Date.now() + idx).toString(),
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

        updateGeneratingStatus('完了！プレビューを表示しています...', 100);

        // Signal quiz is ready - mini-review will show notification and change button
        signalQuizReady(() => {
            showQuizPreview(newMaterial, newQuestions);
        });

    } catch (e) {
        console.error(e);
        alert('生成失敗: ' + e.message);
        stopMiniReview();
        showScreen('home-screen');
    }
}

export async function generateQuizFromUrl(url, customSettings = null) {
    try {
        showScreen('generating-screen');
        startMiniReview();
        updateGeneratingStatus('URLから本文を抽出しています...', 10);

        const text = await fetchTextFromUrl(url);
        await generateQuizFromText(text, url, customSettings);

    } catch (e) {
        console.error(e);
        alert('URLからの生成失敗: ' + e.message);
        stopMiniReview();
        showScreen('home-screen');
    }
}

// Preview generated quiz with images
let previewMaterial = null;
let previewQuestions = [];

export function showQuizPreview(material, questions) {
    previewMaterial = material;
    previewQuestions = questions;

    const modal = document.getElementById('quiz-preview-modal');
    const grid = document.getElementById('preview-grid');
    const title = document.getElementById('preview-title');
    const regenBtn = document.getElementById('regenerate-images-btn');

    if (!modal || !grid) {
        // Fallback if modal doesn't exist
        stopMiniReview();
        showScreen('home-screen');
        alert('クイズ生成完了！');
        return;
    }

    title.textContent = material.title;
    grid.innerHTML = '';

    // Check if any question has images
    const hasImages = questions.some(q => q.imageUrl);

    if (hasImages) {
        // Grid layout for questions with images
        grid.className = 'preview-grid';
        questions.forEach((q, idx) => {
            const card = document.createElement('div');
            card.className = 'preview-card';

            let imageContent = '<div class="preview-no-image">画像なし</div>';

            if (q.imageUrl) {
                if (q.imageGridIndex !== undefined && q.imageGridIndex >= 0) {
                    // 4x3 grid (4 cols, 3 rows)
                    const col = q.imageGridIndex % 4;
                    const row = Math.floor(q.imageGridIndex / 4);
                    const xPos = (col / 3) * 100; // 0, 33.33, 66.66, 100
                    const yPos = (row / 2) * 100; // 0, 50, 100
                    imageContent = `
                        <div class="preview-image-sliced" style="
                            background-image: url('${q.imageUrl}');
                            background-size: 420% 315%;
                            background-position: ${xPos}% ${yPos}%;
                        "></div>
                     `;
                } else {
                    imageContent = `<img src="${q.imageUrl}" alt="Q${idx + 1}" class="preview-image">`;
                }
            }

            const questionText = q.question || q.question_text || '';
            card.innerHTML = `
                <div class="preview-image-container">
                    ${imageContent}
                </div>
                <div class="preview-question">Q${idx + 1}: ${questionText.substring(0, 50)}${questionText.length > 50 ? '...' : ''}</div>
            `;

            grid.appendChild(card);
        });
        // Show regenerate button
        if (regenBtn) regenBtn.style.display = 'inline-block';
    } else {
        // List layout for image-less quizzes
        grid.className = 'preview-list';
        questions.forEach((q, idx) => {
            const item = document.createElement('div');
            item.className = 'preview-list-item';
            const questionText = q.question || q.question_text || '';
            item.innerHTML = `
                <span class="preview-q-number">Q${idx + 1}</span>
                <span class="preview-q-text">${questionText}</span>
            `;

            grid.appendChild(item);
        });
        // Hide regenerate button for image-less quizzes
        if (regenBtn) regenBtn.style.display = 'none';
    }

    // Hide generating screen and show modal
    stopMiniReview();
    showScreen('home-screen');
    modal.classList.remove('hidden');
    modal.style.display = 'block';
}

export async function regenerateImages() {
    if (previewQuestions.length === 0) return;

    const modal = document.getElementById('quiz-preview-modal');
    modal.classList.add('hidden');

    showScreen('generating-screen');
    updateGeneratingStatus('画像を再生成しています...', 50);

    // Clear existing images
    previewQuestions.forEach(q => {
        q.imageUrl = null;
        q.imageGridIndex = undefined;
    });

    await generateImagesForQuestions(previewQuestions);
    saveQuestions();

    // Show preview again
    showQuizPreview(previewMaterial, previewQuestions);
}

export function closePreviewAndGoHome() {
    const modal = document.getElementById('quiz-preview-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    showScreen('home-screen');
}
