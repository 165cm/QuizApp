export const DEFAULT_PROMPTS = {
    // Markdown Conversion
    markdownConversion: `以下のテキストを見やすいマークダウン形式に整形してください。
（サンプル: 本来のプロンプトはこのファイルには含まれません）
テキスト:
{{text}}`,

    // Material Metadata Generation
    metadataGeneration: `教材のメタデータを生成してください。
（サンプル）
出力形式:
{
  "title": "タイトル",
  "summary": "要約",
  "tags": ["タグ"]
}

テキスト:
{{text}}`,

    // Content Analysis (Step 1)
    contentAnalysis: `テキストを分析し、学習コンテキストを作成してください。
（サンプル）
JSON形式で出力:
{
  "audience": "...",
  "goals": ["..."],
  "concepts": ["..."],
  "tone": "...",
  "visualStyle": "..."
}

テキスト:
{{text}}`,

    // Question Generation (Step 2)
    questionGeneration: `クイズを生成してください。
（サンプル）
【学習コンテキスト】
{{context}}
【対象レベル】
{{level}}
【追加の指示】
{{instructions}}

テキスト:
{{text}}`,

    // Image Prompt Generation
    imagePromptGeneration: `画像のプロンプトを生成してください。
（サンプル）
【コンテキスト】
{{context}}
【問題】{{question}}`
};
