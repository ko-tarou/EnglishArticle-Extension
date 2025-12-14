// ページ内のテキストを解析し、翻訳を実行するContent Script

let isTranslating = false;

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Content script received message:', request);
  if (request.action === 'startTranslation') {
    startTranslation().catch(error => {
      console.error('Error in startTranslation:', error);
    });
    sendResponse({ success: true });
  }
  return true;
});

/**
 * 翻訳処理を開始する
 */
async function startTranslation() {
  console.log('startTranslation called');
  
  if (isTranslating) {
    console.log('Translation already in progress');
    return;
  }
  
  isTranslating = true;
  
  try {
    // 設定を取得
    console.log('Getting settings...');
    const settings = await chrome.storage.local.get(['apiKey', 'translationRatio']);
    console.log('Settings:', { hasApiKey: !!settings.apiKey, translationRatio: settings.translationRatio });
    
    if (!settings.apiKey) {
      alert('API Keyが設定されていません。拡張機能のポップアップから設定してください。');
      isTranslating = false;
      return;
    }
    
    const translationRatio = settings.translationRatio || 50;
    console.log(`Translation ratio: ${translationRatio}%`);
    
    // テキストノードを収集
    console.log('Collecting text nodes...');
    const textNodes = collectTextNodes();
    console.log(`Found ${textNodes.length} text nodes`);
    
    if (textNodes.length === 0) {
      alert('翻訳対象のテキストが見つかりませんでした。');
      isTranslating = false;
      return;
    }
    
    // 翻訳対象を選出
    const nodesToTranslate = selectNodesToTranslate(textNodes, translationRatio);
    console.log(`Selected ${nodesToTranslate.length} nodes to translate`);
    
    if (nodesToTranslate.length === 0) {
      alert('翻訳対象がありません。');
      isTranslating = false;
      return;
    }
    
    console.log(`Translating ${nodesToTranslate.length} out of ${textNodes.length} text nodes`);
    console.log('Sample texts to translate:', nodesToTranslate.slice(0, 3).map(n => n.text));
    
    // ローディング表示
    showLoading(nodesToTranslate);
    
    // バッチで翻訳
    await translateNodes(nodesToTranslate, settings.apiKey);
    
    console.log('Translation completed');
    
  } catch (error) {
    console.error('Translation error:', error);
    alert('翻訳中にエラーが発生しました: ' + error.message);
  } finally {
    isTranslating = false;
  }
}

/**
 * ページ内のテキストノードを収集する
 * @returns {Array<{node: Text, text: string, parent: Element}>} テキストノードの配列
 */
function collectTextNodes() {
  const textNodes = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function(node) {
        // スクリプトやスタイルタグ内のテキストは除外
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        
        const tagName = parent.tagName.toLowerCase();
        if (['script', 'style', 'noscript', 'meta', 'link', 'svg', 'path'].includes(tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // 空のテキストや空白のみのテキストは除外
        const text = node.textContent.trim();
        if (!text || text.length < 2) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // 日本語文字が含まれているかチェック
        if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text)) {
          return NodeFilter.FILTER_REJECT;
        }
        
        // 主なテキスト要素に限定
        const allowedTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'span', 'div', 'a', 'td', 'th', 'label', 'button', 'article', 'section', 'header', 'footer', 'main', 'aside', 'blockquote', 'dd', 'dt', 'figcaption'];
        
        // 親要素が許可されたタグか、またはdivで子要素がない場合
        const isAllowedTag = allowedTags.includes(tagName);
        const isDivWithNoChildren = tagName === 'div' && parent.children.length === 0;
        
        // より柔軟な条件: 許可されたタグ、またはテキストが長い場合
        if (isAllowedTag || isDivWithNoChildren || text.length > 10) {
          // さらに、非表示要素を除外
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
        
        return NodeFilter.FILTER_REJECT;
      }
    }
  );
  
  let node;
  while (node = walker.nextNode()) {
    const text = node.textContent.trim();
    if (text) {
      textNodes.push({
        node: node,
        text: text,
        parent: node.parentElement
      });
    }
  }
  
  console.log(`Collected ${textNodes.length} text nodes`);
  if (textNodes.length > 0) {
    console.log('Sample collected texts:', textNodes.slice(0, 5).map(n => n.text.substring(0, 50)));
  }
  
  return textNodes;
}

/**
 * 翻訳対象のノードを選出する
 * @param {Array} textNodes - テキストノードの配列
 * @param {number} ratio - 翻訳割合（0-100）
 * @returns {Array} 選出されたノードの配列
 */
function selectNodesToTranslate(textNodes, ratio) {
  if (ratio === 0) return [];
  if (ratio === 100) return textNodes;
  
  const count = Math.ceil(textNodes.length * (ratio / 100));
  const selected = [];
  const indices = new Set();
  
  // ランダムに選出
  while (indices.size < count && indices.size < textNodes.length) {
    const index = Math.floor(Math.random() * textNodes.length);
    if (!indices.has(index)) {
      indices.add(index);
      selected.push(textNodes[index]);
    }
  }
  
  return selected;
}

/**
 * ローディング表示を行う
 * @param {Array} nodes - 翻訳対象のノード
 */
function showLoading(nodes) {
  nodes.forEach(({ node, parent }) => {
    if (parent) {
      parent.style.transition = 'color 0.3s';
      parent.style.color = '#bbb';
      parent.setAttribute('data-translating', 'true');
    }
  });
}

/**
 * ノードを翻訳する
 * @param {Array} nodes - 翻訳対象のノード
 * @param {string} apiKey - Gemini API Key
 */
async function translateNodes(nodes, apiKey) {
  // テキストを抽出
  const texts = nodes.map(({ text }) => text);
  console.log(`Translating ${texts.length} texts in batches`);
  
  // バッチサイズを設定（一度に送信するテキスト数）
  const BATCH_SIZE = 10;
  const batches = [];
  
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    batches.push(texts.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`Created ${batches.length} batches`);
  
  // 各バッチを順次処理
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNodes = nodes.slice(batchIndex * BATCH_SIZE, (batchIndex + 1) * BATCH_SIZE);
    
    console.log(`Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} texts`);
    
    try {
      // background.jsに翻訳リクエストを送信
      console.log('Sending translation request to background...');
      const response = await chrome.runtime.sendMessage({
        action: 'translateBatch',
        texts: batch,
        apiKey: apiKey
      });
      
      console.log('Received response:', response);
      
      if (response && response.success && response.translations) {
        console.log(`Got ${response.translations.length} translations`);
        // 翻訳結果を適用
        response.translations.forEach((translation, index) => {
          if (batchNodes[index] && translation) {
            console.log(`Applying translation ${index + 1}: "${batchNodes[index].text}" -> "${translation}"`);
            applyTranslation(batchNodes[index], translation);
          }
        });
      } else {
        console.error('Translation failed:', response?.error || 'Unknown error');
        // エラーの場合はローディング表示を解除
        batchNodes.forEach(({ parent }) => {
          if (parent) {
            parent.style.color = '';
            parent.removeAttribute('data-translating');
          }
        });
      }
    } catch (error) {
      console.error('Batch translation error:', error);
      // エラーの場合はローディング表示を解除
      batchNodes.forEach(({ parent }) => {
        if (parent) {
          parent.style.color = '';
          parent.removeAttribute('data-translating');
        }
      });
    }
    
    // バッチ間で少し待機（レート制限対策）
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('All batches processed');
}

/**
 * 翻訳結果を適用する
 * @param {{node: Text, text: string, parent: Element}} nodeData - ノードデータ
 * @param {string} translation - 翻訳されたテキスト
 */
function applyTranslation(nodeData, translation) {
  const { node, parent } = nodeData;
  
  if (!parent) return;
  
  // ローディング表示を解除
  parent.style.color = '';
  parent.removeAttribute('data-translating');
  
  // テキストを置換
  node.textContent = translation;
  
  // 翻訳済みのスタイルを適用
  parent.style.color = '#1e3a8a'; // 濃い青色
  parent.style.fontWeight = '500';
  parent.setAttribute('data-translated', 'true');
  
  // ホバー時に元のテキストを表示（オプション）
  parent.title = `元のテキスト: ${nodeData.text}`;
}

