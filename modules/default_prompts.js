export const DEFAULT_PROMPTS = {
  // Markdown Conversion
  markdownConversion: `以下のテキストを見やすいマークダウン形式に整形してください。

要件:
1. 適切な見出し（#, ##, ###）を追加
2. 段落を整理
3. 重要な部分を強調（**太字**）
4. リストがあれば箇条書きに変換
5. 元の内容を変更せず、構造化のみ行う

テキスト:
{{text}}`,

  // Material Metadata Generation
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

  // Content Analysis (Step 1)
  contentAnalysis: `以下のテキストを分析し、最適なクイズと画像を生成するための「学習コンテキスト」を作成してください。

【出力項目】
1. **ターゲット読者**: どのような層に向けた内容か
2. **学習目標**: このテキストから学ぶべき3つの重要ポイント
3. **キーコンセプト**: 重要な用語や概念
4. **トーン＆スタイル**: 生成するクイズや画像の雰囲気（例：真面目、ユーモラス、感動的）
5. **画像スタイル**: この内容に最も適した視覚表現（例：抽象的な図解、リアルな写真、マンガ風）

JSON形式で出力:
{
  "audience": "...",
  "goals": ["...", "...", "..."],
  "concepts": ["...", "..."],
  "tone": "...",
  "visualStyle": "..."
}

テキスト:
{{text}}`,

  // Question Generation (Step 2)
  questionGeneration: `以下のテキストから{{count}}問のクイズを生成してください。

【学習コンテキスト（分析結果）】
{{context}}

【対象レベル】
{{level}}

【追加の指示】
{{instructions}}

【クイズの目標】
上記のコンテキストに基づき、学習目標を達成できる効果的な問題を作る。

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
{{text}}`,

  // Image Prompt Generation
  imagePromptGeneration: `クイズ問題に関連する画像のプロンプトを生成してください。

【コンテキスト】
{{context}}

【問題】{{question}}

要件:
- 上記のコンテキスト（特にVisual Style）を反映すること
- 英語で60語以内のプロンプトのみを出力
- No text or letters.`
};
