// Gemini APIへのリクエストを処理するService Worker

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request.action);
  
  if (request.action === 'translateBatch') {
    console.log(`Translating batch of ${request.texts?.length || 0} texts`);
    translateBatch(request.texts, request.apiKey)
      .then(translations => {
        console.log(`Translation successful, got ${translations.length} results`);
        sendResponse({ success: true, translations: translations });
      })
      .catch(error => {
        console.error('Translation error in background:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // 非同期処理のため、trueを返してメッセージチャンネルを開いたままにする
    return true;
  }
});

/**
 * 複数のテキストをバッチで翻訳する
 * @param {string[]} texts - 翻訳したいテキストの配列
 * @param {string} apiKey - Gemini API Key
 * @returns {Promise<string[]>} 翻訳されたテキストの配列
 */
async function translateBatch(texts, apiKey) {
  if (!texts || texts.length === 0) {
    console.log('No texts to translate');
    return [];
  }
  
  console.log(`Building prompt for ${texts.length} texts`);
  // プロンプトの構築
  const prompt = buildPrompt(texts);
  
  const requestBody = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }]
  };
  
  // 公式ドキュメントに基づく正しいエンドポイント
  // https://ai.google.dev/gemini-api/docs?hl=ja
  // APIキーはx-goog-api-keyヘッダーで送信する必要がある
  const endpoints = [
    // 公式ドキュメントの推奨モデル（gemini-2.5-flash）
    {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      model: 'gemini-2.5-flash'
    },
    // gemini-2.0-flash（利用可能な場合）
    {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
      model: 'gemini-2.0-flash'
    },
    // 代替モデル
    {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
      model: 'gemini-2.5-pro'
    },
    {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
      model: 'gemini-1.5-pro'
    }
  ];
  
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Trying endpoint: ${endpoint.model}`);
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey  // 公式ドキュメントに基づく正しいヘッダー名
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`API response status: ${response.status}`);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        console.error('API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          model: endpoint.model
        });
        
        // 404エラーまたは400エラーの場合、次のエンドポイントを試す
        if ((response.status === 404 || response.status === 400) && endpoints.indexOf(endpoint) < endpoints.length - 1) {
          console.log(`${response.status} error with model "${endpoint.model}", trying next endpoint...`);
          lastError = new Error(`API Error: ${response.status} - ${errorMessage}`);
          continue;
        }
        
        // 認証エラー（401, 403）の場合は、APIキーが間違っている可能性がある
        if (response.status === 401 || response.status === 403) {
          throw new Error(`認証エラー: API Keyが正しくない可能性があります。ステータス: ${response.status} - ${errorMessage}`);
        }
        
        throw new Error(`API Error: ${response.status} - ${errorMessage}`);
      }
    
      const data = await response.json();
      console.log('API response received');
      
      // レスポンスから翻訳結果を抽出
      const translatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log('Translated text length:', translatedText.length);
      console.log('Translated text preview:', translatedText.substring(0, 200));
      
      // JSON配列をパース
      const translations = parseTranslations(translatedText, texts.length);
      console.log(`Parsed ${translations.length} translations`);
      
      return translations;
    } catch (error) {
      console.error(`Error with endpoint ${endpoint.model}:`, error);
      lastError = error;
      
      // 最後のエンドポイントでない場合は続行
      if (endpoints.indexOf(endpoint) < endpoints.length - 1) {
        continue;
      }
      
      // すべてのエンドポイントで失敗した場合
      throw lastError || error;
    }
  }
  
  // すべてのエンドポイントで失敗した場合
  throw lastError || new Error('All API endpoints failed');
}

/**
 * プロンプトを構築する
 * @param {string[]} texts - 翻訳したいテキストの配列
 * @returns {string} プロンプト文字列
 */
function buildPrompt(texts) {
  const textsJson = JSON.stringify(texts);
  
  return `以下の日本語テキストの配列を英語に翻訳してください。

入力（JSON配列）:
${textsJson}

要件:
1. 各テキストを英語に翻訳してください
2. 出力は翻訳されたテキストのみのJSON配列として返してください
3. 余計な説明や会話は含めないでください
4. 配列の順序は入力と同じ順序にしてください
5. 各要素は元のテキストの意味を正確に保持してください

出力形式（JSON配列のみ）:
["translated text 1", "translated text 2", ...]`;
}

/**
 * APIレスポンスから翻訳結果をパースする
 * @param {string} responseText - APIレスポンスのテキスト
 * @param {number} expectedCount - 期待される翻訳数
 * @returns {string[]} 翻訳されたテキストの配列
 */
function parseTranslations(responseText, expectedCount) {
  try {
    console.log('Parsing translations, expected count:', expectedCount);
    // レスポンステキストからJSON配列を抽出
    // コードブロックやマークダウン記号を除去
    let cleanedText = responseText.trim();
    
    // ```json や ``` を除去
    cleanedText = cleanedText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
    
    // JSON配列の部分を抽出（最初の [ から最後の ] まで）
    const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      cleanedText = jsonMatch[0];
      console.log('Found JSON array in response');
    } else {
      console.warn('No JSON array found in response, trying to parse entire text');
    }
    
    console.log('Cleaned text preview:', cleanedText.substring(0, 300));
    
    const translations = JSON.parse(cleanedText);
    
    // 配列でない場合や要素数が一致しない場合の処理
    if (!Array.isArray(translations)) {
      console.error('Parsed result is not an array:', typeof translations);
      throw new Error('Response is not an array');
    }
    
    console.log(`Parsed array with ${translations.length} items`);
    
    // 要素数が一致しない場合は、不足分を元のテキストで補完
    while (translations.length < expectedCount) {
      translations.push('');
    }
    
    // 余分な要素は削除
    if (translations.length > expectedCount) {
      translations.splice(expectedCount);
    }
    
    return translations;
  } catch (error) {
    console.error('Failed to parse translations:', error);
    console.error('Response text:', responseText);
    // パースに失敗した場合、レスポンステキストを行ごとに分割して返す
    const lines = responseText.split('\n').filter(line => line.trim());
    console.log(`Fallback: returning ${lines.length} lines`);
    return lines.slice(0, expectedCount);
  }
}

