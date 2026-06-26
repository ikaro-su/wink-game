# Face Practice

Flask、SQLAlchemy、Flask-Login、ブラウザ版AIを利用した顔認証・表情採点アプリです。

## 処理の役割

- `face-api`：顔から本人識別用の128次元特徴量を作成
- `MediaPipe`：目・鼻・口などのランドマークから表情を採点
- `Flask`：画面・API・ユーザー登録・ログインを管理
- `SQLAlchemy`：UserモデルとSQLiteデータベースを接続
- `Flask-Login`：ログイン状態をセッションで管理

各ソースファイルには、処理の流れを追える日本語コメントを記載しています。

## ファイル構成

```text
wink_app/
├─ app/
│  ├─ app.py                  アプリケーションファクトリ
│  ├─ config.py               環境ごとの設定
│  ├─ auth/
│  │  ├─ models.py            Userモデル
│  │  ├─ views.py             登録・ログイン
│  │  └─ templates/auth/
│  ├─ training/
│  │  ├─ views.py             モード選択・採点画面
│  │  └─ templates/training/
│  ├─ templates/base.html
│  └─ static/
├─ run.py                     直接起動用
├─ face_landmarker.task
├─ requirements.txt
└─ .env.local
```

`C:\Users\I\Downloads\flaskbook-main\flaskbook-main`の構成を参考に、
アプリケーションファクトリ、設定クラス、Blueprint、モデルを分割しています。

## 初回準備

```powershell
cd C:\Users\I\Desktop\Flask\wink_app
.\venv\Scripts\activate
pip install -r requirements.txt
Copy-Item .env.local .env
```

## 起動

```powershell
flask run
```

ブラウザで `http://127.0.0.1:5000` を開きます。
