実行手順　

注意事項
--------

・初回起動時にwink_app.dbが自動作成されます。
・ユーザー登録時にログインIDが自動発行されます。
・発行されたIDは、パスワード認証または顔認証で使用します。
・顔認証AIの初回読み込みにはインターネット接続が必要です。
・カメラの使用を確認された場合は「許可」を選択してください。

1.仮想環境を作って入る
    
    python -m venv venv
    
    .\venv\Scripts\Activate.ps1
    
    実行できない場合は、次を実行します。
    
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

2.wink-gameに入る(ウインクは関係×)
    
    cd wink-game

3.必要なライブラリをインストールする

    pip install -r requirements.txt

4.環境設定ファイルを作成する

    Copy-Item .env.local .env

5.Flaskアプリを起動する
    
    flask run
    

