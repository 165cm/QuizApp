/**
 * AI Quiz Generator - Prompt Configuration v2
 * 
 * ガチャ式スタイル生成対応
 * Gemini 2.0 Flash 最適化（短いプロンプト）
 * 
 * @version 2.1.0
 */

// ============================================
// ガチャ用スタイルプール
// ============================================

// ベーススタイル（どのカテゴリでも使える）
export const BASE_STYLES = [
  "chibi with sparkly eyes",
  "bold graphic poster",
  "kawaii aesthetic glow",
  "comic book panel",
  "retro 80s neon",
  "watercolor dreamy",
  "pixel art cute",
  "paper cutout collage",
  "sticker design pop",
  "emoji style bold",
  "flat vector minimal",
  "doodle sketch playful",
  "isometric 3d cute",
  "graffiti street art",
  "vintage stamp design"
];

// 感情・アクション
export const EMOTIONS = [
  "excited jumping",
  "surprised shocked face",
  "proud triumphant pose",
  "curious peeking",
  "peaceful floating",
  "mischievous wink",
  "determined power stance",
  "celebrating confetti",
  "thinking lightbulb moment",
  "amazed starry eyes",
  "sneaky tiptoeing",
  "heroic cape flowing"
];

// 演出効果
export const EFFECTS = [
  "dramatic spotlight",
  "sparkle burst",
  "gradient glow",
  "bold black outline",
  "soft dreamy bokeh",
  "motion speed lines",
  "rainbow aura",
  "halftone dots pattern",
  "starburst background",
  "geometric shapes floating",
  "",  // 効果なしも選択肢
  ""
];

// カテゴリ別ボーナススタイル
export const CATEGORY_STYLES = {
  science: [
    "lab experiment bubbles",
    "space galaxy theme",
    "nature wildlife scene",
    "microscopic cell world",
    "eco green leaf motif",
    "chemistry beaker glow",
    "dinosaur fossil dig",
    "weather storm drama",
    "robot technology future",
    "ocean underwater adventure"
  ],
  math: [
    "geometric abstract shapes",
    "puzzle piece aesthetic",
    "blueprint grid style",
    "optical illusion twist",
    "building blocks tower",
    "calculator button pop",
    "maze labyrinth theme",
    "fractal pattern trippy",
    "dice game lucky",
    "clock time spiral"
  ],
  history: [
    "ancient scroll parchment",
    "epic battle scene",
    "treasure map adventure",
    "museum artifact display",
    "time portal vortex",
    "castle kingdom fantasy",
    "samurai warrior spirit",
    "pyramid mystery egypt",
    "viking ship voyage",
    "renaissance art frame"
  ],
  language: [
    "storybook fairy tale",
    "speech bubble comic",
    "theater stage curtain",
    "poetry ink brush",
    "diary notebook sketch",
    "letter envelope seal",
    "library bookshelf cozy",
    "typewriter vintage keys",
    "origami paper fold",
    "calligraphy brush stroke"
  ],
  life: [
    "cozy home interior",
    "outdoor picnic sunny",
    "friendship hug moment",
    "superhero everyday hero",
    "seasonal festival fun",
    "kitchen cooking delicious",
    "sports action dynamic",
    "music concert energy",
    "garden flower bloom",
    "pet animal companion"
  ]
};

// カテゴリ別カラーパレット（複数用意してランダム選択）
export const CATEGORY_COLORS = {
  science: [
    "green blue",
    "teal cyan",
    "lime electric blue",
    "forest emerald",
    "mint aqua"
  ],
  math: [
    "blue orange",
    "purple gold",
    "navy coral",
    "indigo amber",
    "royal blue tangerine"
  ],
  history: [
    "brown cream",
    "sepia gold",
    "burgundy bronze",
    "terracotta sand",
    "mahogany ivory"
  ],
  language: [
    "pink yellow",
    "rose gold",
    "peach lavender",
    "coral mint",
    "magenta lemon"
  ],
  life: [
    "rainbow multicolor",
    "pastel rainbow",
    "warm sunset tones",
    "fresh spring colors",
    "candy pop colors"
  ]
};

// ============================================
// ガチャ生成エンジン
// ============================================

export const GachaEngine = {

  /**
   * 配列からランダムに1つ選択
   */
  pick: (array) => {
    if (!array || array.length === 0) return "";
    return array[Math.floor(Math.random() * array.length)];
  },

  /**
   * 配列からランダムにN個選択（重複なし）
   */
  pickMultiple: (array, count) => {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  },

  /**
   * メインのガチャプロンプト生成
   * @param {string} keyword - 視覚化キーワード
   * @param {string} category - カテゴリ
   * @returns {string} 生成されたプロンプト
   */
  generate: (keyword, category = "life") => {
    const pick = GachaEngine.pick;

    // 各要素をランダム抽選
    const baseStyle = pick(BASE_STYLES);
    const emotion = pick(EMOTIONS);
    const effect = pick(EFFECTS);
    const categoryStyle = pick(CATEGORY_STYLES[category] || CATEGORY_STYLES.life);
    const color = pick(CATEGORY_COLORS[category] || CATEGORY_COLORS.life);

    // 組み合わせパターン（短さを維持しつつバリエーション）
    const patterns = [
      // パターン1: キーワード + 感情 + ベース + 色
      `${keyword}, ${emotion}, ${baseStyle}, ${color}, white background`,

      // パターン2: キーワード + カテゴリ + 効果 + 色
      `${keyword}, ${categoryStyle}, ${effect}, ${color}, white background`,

      // パターン3: キーワード + ベース + 効果 + 色
      `${keyword}, ${baseStyle}, ${effect}, ${color}, white background`,

      // パターン4: キーワード + 感情 + カテゴリ + 色
      `${keyword}, ${emotion}, ${categoryStyle}, ${color}, white background`,

      // パターン5: シンプル強め
      `${keyword}, ${baseStyle}, bold ${color}, white background`,

      // パターン6: 感情 + 効果フォーカス
      `${keyword}, ${emotion}, ${effect}, vibrant ${color}, white background`
    ];


    // パターンをランダム選択
    let prompt = pick(patterns);

    // クリーンアップ（空要素や連続カンマを除去）
    prompt = prompt
      .replace(/,\s*,/g, ',')      // 連続カンマ
      .replace(/,\s*$/g, '')       // 末尾カンマ
      .replace(/\s+/g, ' ')        // 連続スペース
      .trim();

    return prompt;
  },

  /**
   * 12問分のプロンプトを一括生成（重複スタイルを減らす）
   * @param {Array} questions - 問題配列 [{visualKeyword, ...}, ...]
   * @param {string} category - カテゴリ
   * @returns {Array} プロンプト配列
   */
  generateBatch: (questions, category = "life") => {
    // 使用済みスタイルを追跡して偏りを減らす
    const usedBaseStyles = new Set();
    const usedEmotions = new Set();

    return questions.map((q, index) => {
      const keyword = q.visualKeyword || "educational concept";

      // 使用済みを避けてスタイル選択（プールが尽きたらリセット）
      let baseStyle, emotion;

      // ベーススタイル選択（なるべく被らない）
      const availableBase = BASE_STYLES.filter(s => !usedBaseStyles.has(s));
      if (availableBase.length === 0) {
        usedBaseStyles.clear();
        baseStyle = GachaEngine.pick(BASE_STYLES);
      } else {
        baseStyle = GachaEngine.pick(availableBase);
      }
      usedBaseStyles.add(baseStyle);

      // 感情選択（なるべく被らない）
      const availableEmotion = EMOTIONS.filter(e => !usedEmotions.has(e));
      if (availableEmotion.length === 0) {
        usedEmotions.clear();
        emotion = GachaEngine.pick(EMOTIONS);
      } else {
        emotion = GachaEngine.pick(availableEmotion);
      }
      usedEmotions.add(emotion);

      // その他はランダム
      const effect = GachaEngine.pick(EFFECTS);
      const categoryStyle = GachaEngine.pick(CATEGORY_STYLES[category] || CATEGORY_STYLES.life);
      const color = GachaEngine.pick(CATEGORY_COLORS[category] || CATEGORY_COLORS.life);

      // パターン選択（インデックスで分散させる）
      const patternIndex = index % 6;
      const patterns = [
        `${keyword}, ${emotion}, ${baseStyle}, ${color}, white background`,
        `${keyword}, ${categoryStyle}, ${effect}, ${color}, white background`,
        `${keyword}, ${baseStyle}, ${effect}, ${color}, white background`,
        `${keyword}, ${emotion}, ${categoryStyle}, ${color}, white background`,
        `${keyword}, ${baseStyle}, bold ${color}, white background`,
        `${keyword}, ${emotion}, ${effect}, vibrant ${color}, white background`
      ];

      let prompt = patterns[patternIndex];

      // クリーンアップ
      prompt = prompt
        .replace(/,\s*,/g, ',')
        .replace(/,\s*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      return prompt;

    });
  },

  /**
   * デバッグ用：生成されるスタイルをプレビュー
   */
  preview: (keyword, category, count = 5) => {

    for (let i = 0; i < count; i++) {

    }
  }
};

// ============================================
// リアクション画像用（正解・不正解）
// ============================================

export const REACTION_PROMPTS = {
  correct: () => {
    const styles = [
      "happy character celebrating, confetti burst, gold sparkles",
      "chibi jumping joy, rainbow explosion, victory pose",
      "cute mascot cheering, star burst, thumbs up",
      "kawaii celebration dance, glitter shower, bright colors",
      "excited character fireworks, trophy moment, golden glow"
    ];
    return GachaEngine.pick(styles);
  },

  incorrect: () => {
    const styles = [
      "gentle character encouraging, soft glow, warm smile",
      "chibi supportive hug, pastel comfort, try again vibe",
      "cute mascot cheering on, hopeful sparkle, you can do it",
      "kawaii determined pose, gentle rainbow, next time luck",
      "friendly character thumbs up, soft light, keep going"
    ];
    return GachaEngine.pick(styles);
  },

  thinking: () => {
    const styles = [
      "curious character thinking, lightbulb floating, question marks",
      "chibi pondering pose, gears turning, wonder expression",
      "cute mascot detective, magnifying glass, mystery vibe",
      "kawaii brain working, sparkle ideas, concentration",
      "thoughtful character chin rest, floating symbols, eureka moment"
    ];
    return GachaEngine.pick(styles);
  }
};

// ============================================
// メインプロンプト設定
// ============================================

export const DEFAULT_PROMPTS = {

  // Markdown変換
  markdownConversion: `以下のテキストを見やすいマークダウン形式に整形してください。

要件:
1. 適切な見出し（#, ##, ###）を追加
2. 段落を整理
3. 重要な部分を強調（**太字**）
4. リストがあれば箇条書きに変換
5. 元の内容を変更せず、構造化のみ行う

テキスト:
{{text}}`,

  // 教材メタデータ生成
  metadataGeneration: `以下のテキストを分析して、魅力的な学習教材としてのメタデータを生成してください。

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
{{text}}`,

  // Step 1: コンテンツ分析
  contentAnalysis: `以下のテキストを分析し、クイズと画像生成のための「学習コンテキスト」を作成してください。

【出力項目】
1. **ターゲット読者**: どのような層向けか
2. **学習目標**: 学ぶべき3つの重要ポイント
3. **キーコンセプト**: 重要な用語（日本語と英語）
4. **トーン**: クイズの雰囲気
5. **カテゴリ**: science / math / history / language / life から1つ

JSON形式で出力:
{
  "audience": "対象読者",
  "goals": ["目標1", "目標2", "目標3"],
  "concepts": [
    {"ja": "日本語", "en": "English"}
  ],
  "tone": "トーン",
  "category": "science|math|history|language|life"
}

テキスト:
{{text}}`,

  // Step 2: クイズ生成
  questionGeneration: `以下のテキストから{{count}}問のクイズを生成してください。

【学習コンテキスト】
{{context}}

【対象レベル】
{{level}}

【追加指示】
{{instructions}}

【重要】visualKeywordについて
- 問題の「概念・テーマ」を表す英語（2-4単語）
- 答えそのものは含めない
- 画像生成で使うキーワード

出力形式（JSON）:
{
  "questions": [
    {
      "question": "問題文",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctIndex": 0,
      "explanation": "解説文",
      "difficulty": "basic|advanced",
      "tags": ["タグ"],
      "visualKeyword": "english keyword for image"
    }
  ]
}

テキスト:
{{text}}`,

  // Step 3: 画像プロンプト生成（シンプル版 - AIなしで直接使う場合）
  imagePromptGeneration: `Create a short image prompt for this quiz question.

Question: {{question}}
Keyword: {{visualKeyword}}
Category: {{category}}

Rules:
- English only, max 12 words
- Do NOT include the answer
- Make it visually interesting and fun

Output only the prompt text.`
};

// ============================================
// ヘルパー関数
// ============================================

export const ImagePromptHelper = {

  /**
   * プロンプトテンプレートに変数を埋め込む
   */
  fillTemplate: (template, variables) => {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      result = result.split(placeholder).join(valueStr);
    }
    return result;
  },

  /**
   * 単一の画像プロンプトを生成（ガチャ式）
   */
  generateImagePrompt: (keyword, category = "life") => {
    return GachaEngine.generate(keyword, category);
  },

  /**
   * 複数問題の画像プロンプトを一括生成（重複軽減）
   */
  generateImagePrompts: (questions, category = "life") => {
    return GachaEngine.generateBatch(questions, category);
  },

  /**
   * リアクション画像プロンプトを取得
   */
  getReactionPrompt: (type) => {
    const generator = REACTION_PROMPTS[type];
    return generator ? generator() : REACTION_PROMPTS.thinking();
  }
};
