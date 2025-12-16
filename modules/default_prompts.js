/**
 * AI Quiz Generator - Prompt Configuration v3.1
 * 
 * 【v3.1 改善ポイント】
 * - 画像出力：枠線を細く/なしに
 * - 画像出力：文字を含めない指示を強化
 * - ネガティブプロンプト的な指示を追加
 * 
 * @version 3.1.0
 */

// ============================================
// 【v3.1 新規】画像品質制御用の定数
// ============================================

// 文字・枠線を抑制するための共通サフィックス
export const IMAGE_QUALITY_SUFFIX = "no text, no words, no letters, no numbers, no watermark, no border, no frame, borderless, seamless edges";

// より強い抑制が必要な場合
export const IMAGE_QUALITY_SUFFIX_STRICT = "absolutely no text, no typography, no words, no letters, no numbers, no labels, no captions, no watermark, no signature, no border, no frame, no outline edge, borderless design, clean edges, seamless";

// 背景指定（白背景 + 枠なし）
export const BACKGROUND_STYLE = "pure white background, no border, clean edges";

// ============================================
// ガチャ用スタイルプール（v3から継承）
// ============================================

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

export const EFFECTS = [
  "dramatic spotlight",
  "sparkle burst",
  "gradient glow",
  "soft dreamy bokeh",
  "motion speed lines",
  "rainbow aura",
  "halftone dots pattern",
  "starburst background",
  "geometric shapes floating",
  "",
  ""
];
// 注意: "bold black outline" を削除（枠線っぽくなる可能性があるため）

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

export const CATEGORY_COLORS = {
  science: ["green blue", "teal cyan", "lime electric blue", "forest emerald", "mint aqua"],
  math: ["blue orange", "purple gold", "navy coral", "indigo amber", "royal blue tangerine"],
  history: ["brown cream", "sepia gold", "burgundy bronze", "terracotta sand", "mahogany ivory"],
  language: ["pink yellow", "rose gold", "peach lavender", "coral mint", "magenta lemon"],
  life: ["rainbow multicolor", "pastel rainbow", "warm sunset tones", "fresh spring colors", "candy pop colors"]
};

// ============================================
// 【v3.1 改善】ガチャ生成エンジン
// ============================================

const pick = (array) => {
  if (!array || array.length === 0) return "";
  return array[Math.floor(Math.random() * array.length)];
};

export const GachaEngine = {
  pick,

  pickMultiple: (array, count) => {
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  },

  /**
   * 【v3.1改善】単一プロンプト生成（文字なし・枠なし強化版）
   */
  generate: (keyword, category = "life") => {
    const baseStyle = pick(BASE_STYLES);
    const emotion = pick(EMOTIONS);
    const effect = pick(EFFECTS);
    const categoryStyle = pick(CATEGORY_STYLES[category] || CATEGORY_STYLES.life);
    const color = pick(CATEGORY_COLORS[category] || CATEGORY_COLORS.life);

    // 【v3.1】全パターンに文字なし・枠なし指示を追加
    const patterns = [
      `${keyword}, ${emotion}, ${baseStyle}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
      `${keyword}, ${categoryStyle}, ${effect}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
      `${keyword}, ${baseStyle}, ${effect}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
      `${keyword}, ${emotion}, ${categoryStyle}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
      `${keyword}, ${baseStyle}, vibrant ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
      `${keyword}, ${emotion}, ${effect}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`
    ];

    let prompt = pick(patterns);
    prompt = prompt.replace(/,\s*,/g, ',').replace(/,\s*$/g, '').replace(/\s+/g, ' ').trim();
    return prompt;
  },

  /**
   * 【v3.1改善】バッチ生成（統一スタイル + 文字なし・枠なし）
   */
  generateBatch: (questions, category = "life", fixedStyle = null) => {
    if (!questions || !Array.isArray(questions)) return [];

    let style = fixedStyle;
    if (!style) {
      style = {
        baseStyle: pick(BASE_STYLES),
        color: pick(CATEGORY_COLORS[category] || CATEGORY_COLORS.life),
        effect: pick(EFFECTS),
        categoryStyle: pick(CATEGORY_STYLES[category] || CATEGORY_STYLES.life)
      };
    }

    return questions.map((q, index) => {
      const keyword = (q && q.visualKeyword) ? q.visualKeyword : "educational concept";
      const emotion = pick(EMOTIONS);
      const { baseStyle, color, effect, categoryStyle } = style;

      // 【v3.1】全パターンに文字なし・枠なし指示を追加
      const patterns = [
        `${keyword}, ${emotion}, ${baseStyle}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
        `${keyword}, ${categoryStyle}, ${baseStyle}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
        `${keyword}, ${emotion}, ${baseStyle}, ${effect}, ${color}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`,
        `${keyword}, ${baseStyle}, ${color}, simple composition, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`
      ];

      const patternIndex = index % patterns.length;
      let prompt = patterns[patternIndex];
      prompt = prompt.replace(/,\s*,/g, ',').replace(/,\s*$/g, '').replace(/\s+/g, ' ').trim();
      return prompt;
    });
  },

  /**
   * 【v3.1新規】厳格モード生成（文字が出やすい場合に使用）
   */
  generateStrict: (keyword, category = "life") => {
    const baseStyle = pick(BASE_STYLES);
    const emotion = pick(EMOTIONS);
    const color = pick(CATEGORY_COLORS[category] || CATEGORY_COLORS.life);

    // よりシンプルな構成 + 厳格な抑制
    const prompt = `${keyword}, ${emotion}, ${baseStyle}, ${color}, pure white background, ${IMAGE_QUALITY_SUFFIX_STRICT}`;

    return prompt.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  },

  preview: (keyword, category, count = 5) => {
    const results = [];
    for (let i = 0; i < count; i++) {
      results.push(GachaEngine.generate(keyword, category));
    }
    return results;
  }
};

// ============================================
// 【v3.1 改善】リアクション画像用
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
    // 【v3.1】文字なし・枠なし指示を追加
    return `${pick(styles)}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`;
  },
  incorrect: () => {
    const styles = [
      "gentle character encouraging, soft glow, warm smile",
      "chibi supportive hug, pastel comfort, try again vibe",
      "cute mascot cheering on, hopeful sparkle, you can do it pose",
      "kawaii determined pose, gentle rainbow, encouraging gesture",
      "friendly character thumbs up, soft light, keep going mood"
    ];
    return `${pick(styles)}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`;
  },
  thinking: () => {
    const styles = [
      "curious character thinking, lightbulb floating, question marks",
      "chibi pondering pose, gears turning, wonder expression",
      "cute mascot detective, magnifying glass, mystery vibe",
      "kawaii brain working, sparkle ideas, concentration",
      "thoughtful character chin rest, floating symbols, eureka moment"
    ];
    return `${pick(styles)}, ${BACKGROUND_STYLE}, ${IMAGE_QUALITY_SUFFIX}`;
  }
};

// ============================================
// 【v3から継承】学習効果を高めるプロンプト設定
// ============================================

export const DEFAULT_PROMPTS = {

  markdownConversion: `以下のテキストを見やすいマークダウン形式に整形してください。

要件:
1. 適切な見出し（#, ##, ###）を追加
2. 段落を整理
3. 重要な部分を強調（**太字**）
4. リストがあれば箇条書きに変換
5. 元の内容を変更せず、構造化のみ行う

テキスト:
{{text}}`,

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

  contentAnalysis: `以下のテキストを分析し、学習効果の高いクイズを作るための「学習コンテキスト」を作成してください。

【分析の観点】
- 読者が「へぇ！」と驚くポイントはどこか？
- よくある誤解や思い込みは何か？（「実は間違えた効果」の活用）
- ストーリーとして語れる流れは何か？

【出力項目】
1. **ターゲット読者**: どのような層向けか
2. **学習目標**: 学ぶべき3つの重要ポイント（メタ認知を促す形で）
3. **驚きポイント**: 「意外！」と思える事実を3つ
4. **よくある誤解**: 多くの人が勘違いしていそうなこと
5. **キーコンセプト**: 重要な用語（日本語と英語）
6. **ストーリーライン**: 内容を物語として捉えた場合の流れ
7. **トーン**: クイズの雰囲気
8. **カテゴリ**: science / math / history / language / life から1つ

JSON形式で出力:
{
  "audience": "対象読者",
  "goals": ["目標1（〜がわかる）", "目標2（〜ができる）", "目標3（〜を説明できる）"],
  "surprises": ["驚き1", "驚き2", "驚き3"],
  "misconceptions": ["誤解1", "誤解2"],
  "concepts": [
    {"ja": "日本語", "en": "English"}
  ],
  "storyline": "この教材は〜という話。まず〜があり、次に〜となり、最後に〜という結論。",
  "tone": "トーン",
  "category": "science|math|history|language|life"
}

テキスト:
{{text}}`,

  questionGeneration: `以下のテキストから、記憶に残る{{count}}問のクイズを生成してください。

【学習コンテキスト】
{{context}}

【対象レベル】
{{level}}

【追加指示】
{{instructions}}

【クイズ設計の原則】
1. **検索練習の効果を最大化**
   - 単純な暗記問題ではなく「考えさせる」問題にする
   - 「なぜ？」「どうして？」を問う

2. **「実は間違えた効果」を活用**
   - よくある誤解を選択肢に含める
   - 「多くの人がこう思いがちだけど実は…」という気づきを与える

3. **ストーリー性を持たせる**
   - 問題文に具体的な場面設定を入れる
   - 「〜という状況で」「〜のとき」など

4. **解説は3段階構成**
   - フック：「実は…」「意外にも…」で興味を引く
   - 核心：正解の理由を簡潔に
   - 応用：「つまり〜に使える」「だから〜が大切」

【選択肢の設計】
- 正解：明確に正しい
- 誤答1：よくある誤解・思い込み（惜しい間違い）
- 誤答2：部分的に正しいが不完全
- 誤答3：一見もっともらしいが明らかに違う

【出力形式】
{
  "questions": [
    {
      "question": "【場面設定を含む問題文】",
      "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctIndex": 0,
      "explanation": {
        "hook": "実は〜（興味を引く一文）",
        "core": "正解の理由（2-3文）",
        "application": "つまり〜（応用・まとめ）"
      },
      "misconception": "この問題で多くの人が間違えるポイント",
      "difficulty": "basic|intermediate|advanced",
      "learningGoal": "この問題で身につく力（〜がわかる）",
      "tags": ["タグ"],
      "visualKeyword": "english keyword for image (2-4 words, NOT the answer)"
    }
  ]
}

【visualKeywordについて】
- 問題の「概念・テーマ・場面」を表す英語（2-4単語）
- 答えそのものは絶対に含めない
- 画像生成で使うキーワード
- 例：「脳の働き」→ "brain thinking process"
- 例：「復習のタイミング」→ "calendar time concept"

テキスト:
{{text}}`,

  reviewSchedule: `生成されたクイズの復習スケジュールを提案してください。

【検索練習の原則】
- 忘れかけた頃に復習すると効果的
- 間隔を徐々に広げる（1日後→3日後→7日後→14日後）

【出力形式】
{
  "reviewIntervals": [1, 3, 7, 14, 30],
  "reviewTips": [
    "1日後：昨日の内容を思い出してみよう",
    "3日後：忘れかけた頃がベストタイミング",
    "7日後：1週間経っても覚えてる？",
    "14日後：長期記憶への定着チェック",
    "30日後：完全に身についたか確認"
  ]
}`,

  // 【v3.1 改善】画像プロンプト生成
  imagePromptGeneration: `Create a short image prompt for this quiz question.

Question: {{question}}
Keyword: {{visualKeyword}}
Category: {{category}}

Rules:
- English only, max 15 words
- Do NOT include the answer
- Make it visually interesting and fun
- CRITICAL: Add "no text, no words, no border, borderless, white background" at the end

Output only the prompt text.`
};

// ============================================
// 【v3から継承】解説フォーマッター
// ============================================

export const ExplanationFormatter = {
  format: (explanation) => {
    if (typeof explanation === 'string') return explanation;
    if (!explanation) return '';

    const { hook, core, application } = explanation;
    const parts = [];
    if (hook) parts.push(hook);
    if (core) parts.push(core);
    if (application) parts.push(`💡 ${application}`);
    return parts.join('\n\n');
  },

  formatHTML: (explanation, misconception = null) => {
    if (typeof explanation === 'string') {
      let html = `<div class="explanation-text">${explanation}</div>`;
      if (misconception) {
        html += `<div class="explanation-misconception">⚠️ よくある間違い：${misconception}</div>`;
      }
      return html;
    }
    if (!explanation) return '';

    const { hook, core, application } = explanation;
    let html = '';

    if (hook) {
      html += `<div class="explanation-hook" style="color: #fbbf24; margin-bottom: 0.5rem;">💡 ${hook}</div>`;
    }
    if (core) {
      html += `<div class="explanation-core" style="margin-bottom: 0.5rem;">${core}</div>`;
    }
    if (application) {
      html += `<div class="explanation-application" style="color: #a5b4fc; font-style: italic;">→ ${application}</div>`;
    }
    if (misconception) {
      html += `<div class="explanation-misconception" style="margin-top: 0.75rem; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 6px; color: #fca5a5; font-size: 0.85rem;">⚠️ よくある間違い：${misconception}</div>`;
    }

    return html;
  },

  isStructured: (explanation) => {
    return explanation && typeof explanation === 'object' && 'hook' in explanation;
  }
};

// ============================================
// 【v3から継承】難易度判定ヘルパー
// ============================================

export const DifficultyHelper = {
  getLabel: (difficulty) => {
    const labels = {
      basic: "🌱 基本",
      intermediate: "🌿 標準",
      advanced: "🌳 応用"
    };
    return labels[difficulty] || labels.basic;
  },

  getColor: (difficulty) => {
    const colors = {
      basic: "#4CAF50",
      intermediate: "#FF9800",
      advanced: "#F44336"
    };
    return colors[difficulty] || colors.basic;
  },

  getBadgeClass: (difficulty) => {
    const classes = {
      basic: "difficulty-basic",
      intermediate: "difficulty-intermediate",
      advanced: "difficulty-advanced"
    };
    return classes[difficulty] || classes.basic;
  }
};

// ============================================
// ヘルパー関数
// ============================================

export const ImagePromptHelper = {
  fillTemplate: (template, variables) => {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      result = result.split(placeholder).join(valueStr);
    }
    return result;
  },

  generateImagePrompt: (keyword, category = "life") => {
    return GachaEngine.generate(keyword, category);
  },

  /**
   * 【v3.1新規】厳格モードでの画像プロンプト生成
   */
  generateImagePromptStrict: (keyword, category = "life") => {
    return GachaEngine.generateStrict(keyword, category);
  },

  generateImagePrompts: (questions, category = "life") => {
    return GachaEngine.generateBatch(questions, category);
  },

  getReactionPrompt: (type) => {
    const generator = REACTION_PROMPTS[type];
    return generator ? generator() : REACTION_PROMPTS.thinking();
  },

  /**
   * 【v3.1新規】既存プロンプトに文字なし・枠なし指示を追加
   */
  addQualitySuffix: (prompt, strict = false) => {
    const suffix = strict ? IMAGE_QUALITY_SUFFIX_STRICT : IMAGE_QUALITY_SUFFIX;
    return `${prompt}, ${suffix}`;
  }
};

// ============================================
// 復習間隔の定数
// ============================================

export const REVIEW_INTERVALS = {
  initial: [1, 3, 7, 14, 30],
  tips: {
    1: "昨日の内容を思い出してみよう",
    3: "忘れかけた頃がベストタイミング",
    7: "1週間経っても覚えてる？",
    14: "長期記憶への定着チェック",
    30: "完全に身についたか確認"
  }
};
