import { appState } from './state.js';
import { saveQuestions, saveMaterials, saveMaterialToCloud, saveQuestionToCloud } from './storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI, startMiniReview, stopMiniReview, signalQuizReady } from './ui.js';
import { DEFAULT_PROMPTS } from './default_prompts.js';

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

// Generate Image Prompt
export async function generateImagePrompt(question, choices, correctAnswer, context = null) {
    let prompt = DEFAULT_PROMPTS.imagePromptGeneration;
    prompt = prompt.replace('{{question}}', question);

    // Context Injection
    let contextStr = 'Style: surreal, interesting, minimal text.';
    if (context) {
        contextStr = `
- Visual Style: ${context.visualStyle}
- Tone: ${context.tone}
- Audience: ${context.audience}
`;
    }
    prompt = prompt.replace('{{context}}', contextStr);

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

// DALL-E Generation (Removed)
// export async function generateImageWithDALLE(imagePrompt) { ... }

// Google Nano Banana Pro (Imagen 3) Generation - Returns array of images
export async function generateImageWithGoogle(prompts) {
    if (!appState.googleApiKey) throw new Error('Google APIキーが設定されていません');

    // Generate up to 3 images at once using sampleCount
    const sampleCount = Math.min(prompts.length, 3);
    const combinedPrompt = prompts.slice(0, sampleCount).map((p, i) => `Scene ${i + 1}: ${p}`).join('. ');

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-images:predict?key=${appState.googleApiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            instances: [{ prompt: combinedPrompt + " Style: realistic, detailed, natural lighting. Each scene is distinct." }],
            parameters: {
                sampleCount: sampleCount,
                aspectRatio: "16:9"
            }
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || '画像生成失敗 (Nano Banana Pro)');
    }
    const data = await response.json();
    const predictions = data.predictions || [];

    return predictions.map(p => `data:image/png;base64,${p.bytesBase64Encoded}`);
}

// Wrapper to choose model (Always Google Nano Banana Pro)
export async function generateImagesWithSelectedModel(prompts) {
    return await generateImageWithGoogle(prompts);
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

// Helper to generate prompts for questions
async function generatePromptsForBatch(questions, context) {
    const prompts = [];
    for (const q of questions) {
        const p = await generateImagePrompt(q.question, q.choices, q.choices[q.correctIndex], context);
        prompts.push(p);
    }
    return prompts;
}

export async function generateImagesForQuestions(questions) {
    const useImageGen = document.getElementById('image-gen-checkbox')?.checked;
    if (!useImageGen) return;

    // Filter questions that don't have images yet
    const targetQuestions = questions.filter(q => !q.imageUrl);
    if (targetQuestions.length === 0) return;

    // Batch into groups of 9 (3x3 grid)
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

            // 1. Generate prompts for this batch
            // Retrieve context if available (attached to first question of batch or passed down? 
            // Currently questions don't store the context object. 
            // Hack: I need to pass context to generateImagesForQuestions logic.
            // But generateImagesForQuestions is called separately. 
            // I will modify generateImagesForQuestions to accept context or retrieve it from material?
            // For now, let's assume no context for image regen unless I change signature.
            // Wait, I can pass strict context in step 4 modification below.
            const prompts = await generatePromptsForBatch(batch, questions[0].contextData);

            // 2. Create Grid Prompt (3x3)
            let gridPrompt = "Create a single image with a 3x3 grid layout (9 panels). Each panel contains a distinct illustration. IMPORTANT: Do NOT include any text, labels, numbers, or written characters in any panel. The image should be in 16:9 aspect ratio. Pure visual illustrations only. ";
            prompts.forEach((p, idx) => {
                gridPrompt += `Panel ${idx + 1}: ${p}. `;
            });
            // Fill remaining panels if batch is smaller than 9
            for (let i = prompts.length; i < 9; i++) {
                gridPrompt += `Panel ${i + 1}: abstract minimalist pattern. `;
            }
            gridPrompt += "Style: cohesive, consistent lighting, realistic. REMINDER: No text, no numbers, no labels anywhere in the image.";

            // 3. Generate single grid image
            const imageUrl = await generateGridImage(gridPrompt);

            // 4. Assign to questions with grid index
            const newQuestions = [];
            batch.forEach((q, idx) => {
                q.imageUrl = imageUrl;
                q.imagePrompt = prompts[idx];
                q.imageGridIndex = idx; // 0-8 for grid position
                newQuestions.push(q);
            });

            // Force Cloud Sync for images (Prioritize Cloud)
            if (appState.currentUser) {
                for (const q of newQuestions) {
                    await saveQuestionToCloud(q);
                }
            }

            // Save locally (might fail if quota exceeded)
            try {
                saveQuestions();
            } catch (quotaError) {
                console.warn('Local Storage Quota Exceeded:', quotaError);
                // Continue, as cloud save succeeded
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
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: gridPrompt }]
                }],
                generationConfig: {
                    responseModalities: ["IMAGE"]
                    // Optional parameters for Nano Banana Pro if needed:
                    // imageGenerationConfig: { sampleCount: 1, aspectRatio: "16:9" } 
                }
            })
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

        throw new Error('画像データが取得できませんでした');
    } catch (e) {
        console.error("Gemini Image Gen Error:", e);
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
                    const col = q.imageGridIndex % 3;
                    const row = Math.floor(q.imageGridIndex / 3);
                    const xPos = col * 50;
                    const yPos = row * 50;
                    imageContent = `
                        <div class="preview-image-sliced" style="
                            background-image: url('${q.imageUrl}');
                            background-size: 315% 315%;
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
