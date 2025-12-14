// DOM要素の取得
const apiKeyInput = document.getElementById('apiKey');
const translationRatioInput = document.getElementById('translationRatio');
const ratioValue = document.getElementById('ratioValue');
const saveBtn = document.getElementById('saveBtn');
const translateBtn = document.getElementById('translateBtn');
const status = document.getElementById('status');

// 翻訳割合スライダーの更新
translationRatioInput.addEventListener('input', (e) => {
  ratioValue.textContent = e.target.value;
});

// 設定の読み込み
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['apiKey', 'translationRatio']);
    
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    
    if (result.translationRatio !== undefined) {
      translationRatioInput.value = result.translationRatio;
      ratioValue.textContent = result.translationRatio;
    }
    
    // APIキーが未設定の場合は警告を表示
    if (!result.apiKey) {
      showWarning();
    }
  } catch (error) {
    showStatus('設定の読み込みに失敗しました', 'error');
  }
}

// 警告メッセージの表示
function showWarning() {
  const warning = document.createElement('div');
  warning.className = 'warning';
  warning.innerHTML = '<strong>⚠️ API Keyが設定されていません</strong>翻訳機能を使用するには、Gemini API Keyを入力してください。';
  const container = document.querySelector('.container');
  container.insertBefore(warning, container.firstChild.nextSibling);
}

// 設定の保存
saveBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const translationRatio = parseInt(translationRatioInput.value);
  
  if (!apiKey) {
    showStatus('API Keyを入力してください', 'error');
    return;
  }
  
  try {
    await chrome.storage.local.set({
      apiKey: apiKey,
      translationRatio: translationRatio
    });
    
    showStatus('設定を保存しました', 'success');
    
    // 警告を削除
    const warning = document.querySelector('.warning');
    if (warning) {
      warning.remove();
    }
  } catch (error) {
    showStatus('設定の保存に失敗しました', 'error');
  }
});

// 翻訳開始ボタン
translateBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showStatus('API Keyを入力してください', 'error');
    return;
  }
  
  // 設定を保存
  const translationRatio = parseInt(translationRatioInput.value);
  await chrome.storage.local.set({
    apiKey: apiKey,
    translationRatio: translationRatio
  });
  
  try {
    // 現在のタブを取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 特殊なページ（chrome://、chrome-extension://など）ではcontent scriptが動作しない
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
      showStatus('このページでは翻訳機能を使用できません', 'error');
      return;
    }
    
    // まずメッセージを送信してみる（content scriptが既に読み込まれている場合）
    let messageSent = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
      messageSent = true;
    } catch (error) {
      // メッセージ送信に失敗した場合、content scriptを注入してから再試行
      console.log('Content script not loaded, injecting...', error);
      
      try {
        // content.jsを注入
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        
        // content scriptの初期化を待つ
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 再度メッセージを送信
        await chrome.tabs.sendMessage(tab.id, { action: 'startTranslation' });
        messageSent = true;
      } catch (injectError) {
        console.error('Failed to inject content script:', injectError);
        throw new Error('Content scriptの注入に失敗しました。ページをリロードしてから再度お試しください。');
      }
    }
    
    if (messageSent) {
      showStatus('翻訳を開始しました', 'info');
      
      // 2秒後にポップアップを閉じる
      setTimeout(() => {
        window.close();
      }, 2000);
    }
  } catch (error) {
    console.error('Translation start error:', error);
    showStatus('翻訳の開始に失敗しました: ' + error.message, 'error');
  }
});

// ステータスメッセージの表示
function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
  
  // 3秒後に自動で非表示
  setTimeout(() => {
    status.className = 'status';
    status.textContent = '';
  }, 3000);
}

// ページ読み込み時に設定を読み込む
loadSettings();

