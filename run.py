from app.app import create_app


# app/app.pyのcreate_app関数を呼び出して、Flaskアプリを生成する。
# このapp変数があるため「python run.py」でも起動できる。
app = create_app("local")


if __name__ == "__main__":
    # このファイルを直接実行した場合だけ、開発用サーバーを起動する。
    app.run(debug=True)
