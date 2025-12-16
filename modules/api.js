import { appState } from './state.js';
import { saveQuestions, saveMaterials, saveMaterialToCloud, saveQuestionToCloud, uploadImage, getDeviceId } from './storage.js';
import { showScreen, updateStatsUI, updateMaterialSelectUI, startMiniReview, stopMiniReview, signalQuizReady, showGenerationCompleteModal } from './ui.js';
import { DEFAULT_PROMPTS, ImagePromptHelper, GachaEngine } from './default_prompts.js';
import { showPublicLibrary } from './library.js';



const GAS_PROXY_URL = 'https://script.google.com/macros/s/AKfycbzjUYYE64VAyp0q3Lini-_yxUI-lQBbQKIb3dUdf4SbcSdGr3pdndMDBxTVNjeAuhMT4Q/exec';

async function callChatCompletion({ messages, model = 'gpt-4o-mini', temperature = 0.5, response_format = null, generateImage = false, imagePrompt = null }) {
    // 1. APIキーがある場合: OpenAIを直接呼ぶ
    if (appState.apiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${appState.apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature, response_format })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'AI API Error');
        }
        return await response.json();
    }
    // 2. APIキーがない場合: GASプロキシを呼ぶ（無料枠/先着枠）
    else {
        const payload = {
            deviceId: getDeviceId(),
            messages,
            model,
            temperature,
            response_format,
            generateImage, // 画像生成もリクエストするか
            imagePrompt
        };

        const response = await fetch(GAS_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            // 429(Limit)や500など
            let errMsg = 'Proxy Error';
            try {
                const err = await response.json();
                errMsg = err.message || err.error || errMsg;
            } catch (e) { }
            throw new Error(errMsg);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.message || data.error);
        }
        return data;
    }
}


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

    const data = await callChatCompletion({
        messages: [
            { role: 'system', content: 'あなたはテキスト整形の専門家です。与えられたテキストを見やすいマークダウン形式に整形します。' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.3
    });

    return data.choices[0].message.content;
}

// Analyze Learning Content (Step 1)
async function analyzeLearningContent(text) {
    const maxChars = 6000;
    const truncatedText = text.slice(0, maxChars);

    let prompt = DEFAULT_PROMPTS.contentAnalysis;
    prompt = prompt.replace('{{text}}', truncatedText);

    const data = await callChatCompletion({
        messages: [
            { role: 'system', content: 'あなたは教育カリキュラムの専門家です。' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        response_format: { type: "json_object" }
    });

    return JSON.parse(data.choices[0].message.content);
}

// Generate Material Metadata
export async function generateMaterialMetadata(text, fileName) {
    const maxChars = 6000;
    const truncatedText = text.slice(0, maxChars);

    // Use Template
    let prompt = DEFAULT_PROMPTS.metadataGeneration;
    prompt = prompt.replace('{{text}}', truncatedText);

    try {
        const data = await callChatCompletion({
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
        });

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

    // Context Injection (v3: includes surprises, misconceptions, storyline)
    let contextStr = '特になし';
    if (customSettings?.context) {
        const c = customSettings.context;
        const conceptsStr = Array.isArray(c.concepts)
            ? c.concepts.map(con => typeof con === 'object' ? `${con.ja}(${con.en})` : con).join(', ')
            : '';
        contextStr = `
- ターゲット読者: ${c.audience || '一般'}
- 学習目標: ${(c.goals || []).join(', ')}
- 驚きポイント: ${(c.surprises || []).join(', ')}
- よくある誤解: ${(c.misconceptions || []).join(', ')}
- キーコンセプト: ${conceptsStr}
- ストーリーライン: ${c.storyline || ''}
- トーン: ${c.tone || '親しみやすい'}
`;
    }
    prompt = prompt.replace('{{context}}', contextStr);

    // Language instruction
    const langInstruction = outputLang === 'auto'
        ? 'ソーステキストと同じ言語で出力してください。'
        : `出力は必ず${outputLang}で生成してください。`;

    const data = await callChatCompletion({
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
    });

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

// Helper to generate prompts for questions using GachaEngine
function generatePromptsForBatch(questions, context) {
    const category = (context && context.category) ? context.category : 'life';

    // Decide a Master Style for this batch (Unity of Theme)
    // The GachaEngine.generateBatch will now handle "Per Batch" consistency automatically
    // if we don't pass a fixed style, it generates one internally for the whole batch.
    // So we just call it.
    return GachaEngine.generateBatch(questions, category);
}



// Helper to generate Rank Image Ideas (コスプレ博士 template)
// Helper to generate Rank Image Ideas (Visual Evolution theme)
async function generateRankPrompts(context) {
    const topic = context ? context.topic : 'General Knowledge';
    const contentSummary = context ? context.sourceText?.substring(0, 500) : '';

    // Prompt Generation for Ranks
    const systemPrompt = `You are a visual prompt engineer.
Topic: "${topic}"
Content hint: "${contentSummary}"

**TASK**: Create 3 SHORT image prompts for Gold/Silver/Bronze rankings.

**STEP 1 - CHARACTER**:
Choose ONE cute mascot character that perfectly matches "${topic}".

**STEP 2 - CREATE 3 VARIATIONS**:
- Gold (Master): Triumphant champion, golden aura, celebrating victory.
- Silver (Expert): Cool and confident, professional pose.
- Bronze (Novice): Comically panicked, sweating, messy.

**RULES**:
- Each prompt under 20 words.
- Style: Japanese chibi anime character, simple background.
- Same character in all 3, only emotion changes.

Output JSON:
{
  "prompts": [
    "Gold rank: [character] triumphant...",
    "Silver rank: [character] confident...",
    "Bronze rank: [character] panicked..."
  ]
}`;

    try {
        const data = await callChatCompletion({
            messages: [
                { role: 'system', content: 'You are a helpful assistant. Output JSON only.' },
                { role: 'user', content: systemPrompt }
            ],
            temperature: 0.9, // Higher creative variety
            response_format: { type: "json_object" }
        });

        const content = data.choices[0].message.content;
        const parsed = JSON.parse(content);

        let results = [];
        if (Array.isArray(parsed)) results = parsed;
        else if (parsed.prompts) results = parsed.prompts;
        else if (parsed.ranks) results = parsed.ranks;
        else results = Object.values(parsed).slice(0, 3);

        if (results.length < 3) throw new Error('Not enough rank prompts generated');
        // Add style suffix ensuring high quality
        return results.slice(0, 3).map(r => r + " 3D render, vibrant lighting, volumetric fog, 8k resolution.");

    } catch (e) {
        console.warn('Rank prompt gen failed, using fallback', e);
        // Fallback: Evolution of an element related to the topic
        return [
            `Pixar 3D style.Ultimate Master of ${topic}. A majestic, glowing, god - like entity or character made of ${topic} elements, floating in golden light, epic composition, triumphant.`,
            `Pixar 3D style.Skilled Expert of ${topic}. A confident, cool character wielding ${topic} tools efficiently, dynamic pose, blue and silver lighting, professional.`,
            `Pixar 3D style.Clumsy Novice of ${topic}. A cute, small, confused character overwhelmed by ${topic} elements, tangled or messy, warm bronze lighting, funny expression.`
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
            updateGeneratingStatus(`画像を生成中... (${batchNum} /${batches.length})`, 80 + (batchNum / batches.length) * 15);

            // 1. Generate prompts for this batch (Questions)
            // Retrieve context from first question if available
            const context = batch[0].contextData || null;
            const prompts = generatePromptsForBatch(batch, context);


            // 2. Add Rank Prompts (3 slots) to make 12 total
            let rankPrompts = [];
            try {
                rankPrompts = await generateRankPrompts(context);
            } catch (err) {
                console.warn('Rank prompt gen failed, using fallback', err);
                const topic = context ? context.topic : 'Learning';
                rankPrompts = [
                    `Japanese Anime style, vivid colors. Gold Rank: A cute ${topic} Mascot Character in GOD MODE, glowing golden aura, triumphant atmosphere.`,
                    `Japanese Anime style, vivid colors. Silver Rank: A cute ${topic} Mascot Character looking confident and cool, professional atmosphere.`,
                    `Japanese Anime style, vivid colors. Bronze Rank: A cute ${topic} Mascot Character panic-crying, messy failure, comical atmosphere.`
                ];
            }
            prompts.push(...rankPrompts);


            // 3. Create Grid Prompt (4x3 = 12 panels) - v3.1: no text, no thick borders
            let gridPrompt = "Create a single image with a STRICT 4:3 Aspect Ratio, containing a 4x3 grid layout (12 panels). 4 columns, 3 rows. \n";
            gridPrompt += "Panel size: Each panel MUST be a perfect SQUARE (1:1 aspect ratio). \n";
            gridPrompt += "Very thin subtle separator lines between panels (almost invisible). \n";

            prompts.forEach((p, idx) => {
                // Truncate individual prompts to prevent overflow/confusion
                let cleanP = p.length > 50 ? p.substring(0, 50) + "..." : p;
                gridPrompt += `Panel ${idx + 1}: ${cleanP}. \n`;
            });
            // Fill remaining panels
            for (let i = prompts.length; i < 12; i++) {
                gridPrompt += `Panel ${i + 1}: colorful abstract pattern. \n`;
            }
            gridPrompt += "Constraint: Maintain perfect 4x3 grid alignment. All 12 panels distinct and SQUARE. Cohesive Japanese Anime style, vivid colors. ";
            gridPrompt += "IMPORTANT: No text, no words, no letters, no numbers in any panel. No thick borders or frames.";

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

            // Force Cloud Sync for images (無料枠ユーザーのみ)
            if (appState.currentUser && !appState.apiKey) {
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
            alert(`画像生成スキップ: ${e.message}`);
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
    // 1. Check Google API Key
    if (!appState.googleApiKey) {
        // Fallback to GAS Proxy if no Google Key AND no OpenAI Key (Free Tier user)
        // If user has OpenAI key but no Google Key, they can't create image unless we route via proxy?
        // But proxy assumes Free Tier logic.
        // Let's allow proxy if NO Google Key is present, using OpenAI's free login logic check?
        // Simpler: If no Google Key, try proxy.
        // Proxy uses Google Key on server side.

        // Proxy call
        try {
            console.log('🤖 Using GAS Proxy for Image Gen...');
            const payload = {
                deviceId: getDeviceId(),
                messages: [{ role: 'user', content: 'ignore' }], // Dummy for OpenAI text part
                model: 'gpt-4o-mini',
                generateImage: true,
                imagePrompt: gridPrompt
            };

            const response = await fetch(GAS_PROXY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Image Proxy Error');
            const data = await response.json();

            if (data.imageMessage && !data.imageData) {
                throw new Error(data.imageMessage); // Limit reached msg
            }
            if (data.imageData) return data.imageData;
            throw new Error('No image data returned from proxy');

        } catch (e) {
            throw new Error('画像生成失敗: ' + e.message);
        }
    }

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


// --- Progress Simulation Helper ---
let progressInterval = null;

function startProgressSimulation(startPercent, targetPercent, estimatedDurationMs) {
    if (progressInterval) clearInterval(progressInterval);

    let current = startPercent;
    const stepTime = 100; // Update every 100ms
    const totalSteps = estimatedDurationMs / stepTime;
    const increment = (targetPercent - startPercent) / totalSteps;

    // Initial set
    updateGeneratingStatus(document.getElementById('generating-status')?.textContent || '処理中...', current);

    progressInterval = setInterval(() => {
        current += increment;
        if (current >= targetPercent) {
            current = targetPercent;
            clearInterval(progressInterval);
        }
        // Keep the message same, just update bar
        const statusEl = document.getElementById('generating-status');
        if (statusEl) {
            const fillEl = document.getElementById('progress-fill');
            if (fillEl) fillEl.style.width = current + '%';
        }
    }, stepTime);
}

function stopProgressSimulation() {
    if (progressInterval) clearInterval(progressInterval);
    progressInterval = null;
}

export async function generateQuizFromText(text, sourceName, customSettings = null) {
    try {
        showScreen('generating-screen');
        startMiniReview();

        // 1. Text Analysis
        updateGeneratingStatus('テキストを解析しています...', 10);
        startProgressSimulation(10, 25, 3000); // Est 3s

        const metadata = await generateMaterialMetadata(text, sourceName);
        stopProgressSimulation();

        // 2. Markdown Conversion
        updateGeneratingStatus('学習用コンテンツを整形しています...', 30);
        startProgressSimulation(30, 50, 5000); // Est 5s
        const markdownContent = await convertTextToMarkdown(text);
        stopProgressSimulation();

        // 3. Learning Analysis
        updateGeneratingStatus('AIが学習内容を分析しています...', 50);
        startProgressSimulation(50, 60, 4000); // Est 4s
        const analysisContext = await analyzeLearningContent(text);
        stopProgressSimulation();

        // Merge analysis into settings for passing to question generator
        const genSettings = { ...customSettings, context: analysisContext };

        // 4. Question Generation (The longest part)
        updateGeneratingStatus('クイズを作成しています... (分析完了)', 60);
        startProgressSimulation(60, 85, 15000); // Est 15s for questions

        // Check Image Gen setting
        const useImageGen = document.getElementById('image-gen-checkbox')?.checked;

        // Generate 12 questions, use first 9 (safety margin for AI variability)
        const qCountRequest = 12;
        const qCountTarget = 9;

        let questions = await generateQuestionsWithAI(text, sourceName, qCountRequest, genSettings);
        stopProgressSimulation();

        // Take first 9 (or all if less than 9 were generated)
        questions = questions.slice(0, qCountTarget);

        // Attach context to questions for image generation usage
        questions.forEach(q => q.contextData = analysisContext);

        // ... Saving logic (Fast) ...
        const materialId = crypto.randomUUID ? crypto.randomUUID() : 'mat_' + Date.now();
        const newMaterial = {
            id: materialId,
            title: metadata.title,
            summary: metadata.summary,
            content: markdownContent,
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

        if (!appState.apiKey) {
            await saveMaterialToCloud(newMaterial);
            for (const q of newQuestions) {
                await saveQuestionToCloud(q);
            }
        }

        // 5. Image Generation
        if (appState.currentUser) {
            updateGeneratingStatus('関連画像を生成しています...', 85);
            startProgressSimulation(85, 95, 10000); // Est 10s
            await generateImagesForQuestions(newQuestions);
            stopProgressSimulation();
        } else {
            updateGeneratingStatus('画像生成にはログインが必要です（スキップ）', 90);
        }

        updateGeneratingStatus('完了！みんなの広場に移動します...', 100);

        // クイズ生成完了後は「プレビュー画面」を表示 (生成完了モーダルの代わりに)
        signalQuizReady(() => {
            showQuizPreview(newMaterial, newQuestions);
        });

    } catch (e) {
        console.error(e);
        stopProgressSimulation();
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

    // Show regenerated preview
    showQuizPreview(previewMaterial, previewQuestions);
}

// Fixed: Add Start Button and Fix Flow
export function showQuizPreview(material, questions) {
    previewMaterial = material;
    previewQuestions = questions;

    const modal = document.getElementById('quiz-preview-modal');
    const grid = document.getElementById('preview-grid');
    const title = document.getElementById('preview-title');
    const regenBtn = document.getElementById('regenerate-images-btn');

    // Create or Get Start Button in Preview Modal
    let startBtn = document.getElementById('preview-start-btn');
    if (!startBtn) {
        // If not existing, try to find a place to inject or repurpose
        // Assuming modal has a footer or actions area
        const actions = modal.querySelector('.preview-actions') || modal.querySelector('.modal-footer');
        if (actions) {
            startBtn = document.createElement('button');
            startBtn.id = 'preview-start-btn';
            startBtn.className = 'btn btn-primary';
            startBtn.innerHTML = '▶ クイズを始める';
            actions.insertBefore(startBtn, actions.firstChild); // Put first
        }
    }

    if (!modal || !grid) {
        // Fallback: If no preview modal structure, use the Generation Complete element
        showGenerationCompleteModal(material);
        return;
    }

    title.textContent = material.title;
    grid.innerHTML = '';

    // Check if any question has images
    const hasImages = questions.some(q => q.imageUrl);

    if (hasImages) {
        grid.className = 'preview-grid';
        questions.forEach((q, idx) => {
            const card = document.createElement('div');
            card.className = 'preview-card';
            let imageContent = '<div class="preview-no-image">画像なし</div>';
            if (q.imageUrl) {
                if (q.imageGridIndex !== undefined && q.imageGridIndex >= 0) {
                    const col = q.imageGridIndex % 4;
                    const row = Math.floor(q.imageGridIndex / 4);
                    const xPos = (col / 3) * 100;
                    const yPos = (row / 2) * 100;
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
                <div class="preview-image-container">${imageContent}</div>
                <div class="preview-question">Q${idx + 1}: ${questionText.substring(0, 50)}${questionText.length > 50 ? '...' : ''}</div>
            `;
            grid.appendChild(card);
        });
        if (regenBtn) regenBtn.style.display = 'inline-block';
    } else {
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
        if (regenBtn) regenBtn.style.display = 'none';
    }

    stopMiniReview();
    showScreen('home-screen'); // Ensure background
    modal.classList.remove('hidden');
    modal.style.display = 'block';

    // Event Listener for Start
    console.log('[Debug] showQuizPreview - startBtn exists:', !!startBtn);
    if (startBtn) {
        startBtn.onclick = () => {
            console.log('[Debug] preview-start-btn clicked! Material ID:', material.id);
            modal.classList.add('hidden');
            modal.style.display = 'none';
            if (window.startQuizWithMaterial) {
                console.log('[Debug] Calling window.startQuizWithMaterial');
                window.startQuizWithMaterial(material.id);
            } else {
                console.error('[Debug] window.startQuizWithMaterial NOT FOUND!');
            }
        };
    }
}

export function closePreviewAndGoHome() {
    const modal = document.getElementById('quiz-preview-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    showScreen('home-screen');
}
