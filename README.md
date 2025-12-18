# [English Article Extension](https://chromewebstore.google.com/detail/english-article-extension/pphhahildjodcahphkiphpimnbbnapep)

Webページ上の日本語テキストを指定した割合でGoogle Gemini APIを使用して英語に翻訳するChrome拡張機能です。

## 機能

- ページ内の日本語テキストを自動検出
- 指定した割合（0% - 100%）でランダムにテキストを選出して翻訳
- バッチ処理による効率的な翻訳（レート制限対策）
- 翻訳中のローディング表示
- 翻訳済みテキストの視覚的な区別

## セットアップ

### 1. Gemini API Keyの取得

1. [Google AI Studio](https://makersuite.google.com/app/apikey) にアクセス
2. API Keyを作成・取得

### 2. Chrome拡張機能のインストール

1. Chromeで `chrome://extensions/` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このプロジェクトのフォルダを選択

### 3. 設定

1. 拡張機能のアイコンをクリックしてポップアップを開く
2. Gemini API Keyを入力
3. 翻訳割合をスライダーで設定（0% - 100%）
4. 「保存」ボタンをクリック

## 使用方法

1. 翻訳したいWebページを開く
2. 拡張機能のアイコンをクリック
3. 「翻訳を開始」ボタンをクリック
4. ページ内の日本語テキストが指定した割合で英語に翻訳されます

## 技術仕様

- **Manifest V3** 対応
- **Google Gemini API** (`gemini-1.5-flash` モデル)
- **バッチ処理**: 複数のテキストを一度にAPIに送信して効率化
- **CORS対策**: Service Worker (background.js) でAPI通信を実行

## ファイル構成

```
EnglishArticle-Extension/
├── manifest.json      # 拡張機能の設定ファイル
├── popup.html         # 設定画面のHTML
├── popup.css          # 設定画面のスタイル
├── popup.js           # 設定画面のロジック
├── content.js         # ページ解析とテキスト置換
├── background.js      # Gemini API通信処理
└── README.md          # このファイル
```

## 注意事項

- API Keyは安全に管理してください
- 大量のテキストを翻訳する場合、APIのレート制限に注意してください
- 翻訳結果は元のテキストに置き換えられます（ページをリロードすると元に戻ります）

## ライセンス

LICENSEファイルを参照してください。
