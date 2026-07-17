from flask import Flask
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy

from app.config import config


# 拡張機能はここではFlaskアプリと結び付けず、空の状態で作成
# create_app内のinit_appで結び付け、テスト用など複数の設定を使えるように
db = SQLAlchemy()
login_manager = LoginManager()

# @login_requiredが付いた画面へ未ログインで接続した場合の移動先
login_manager.login_view = "auth.index"
login_manager.login_message = ""


def create_app(config_key="local"):
    #アプリケーション組み立て

    # Flaskアプリ本体を作成する
    app = Flask(__name__)

    # "local"や"testing"に対応する設定クラスを読み込む
    app.config.from_object(config[config_key])

    # SQLAlchemyとFlask-Loginを、このFlaskアプリへ接続
    db.init_app(app)
    login_manager.init_app(app)

    # 循環import対策必須
    from app.auth import views as auth_views
    from app.training import views as training_views

    # 認証機能とトレーニング機能のURLをアプリへ登録
    app.register_blueprint(auth_views.auth)
    app.register_blueprint(training_views.training)

    # DB操作用アプリケーションコンテキスト。
    with app.app_context():
        # usersテーブルがなければ、Userモデルの定義から自動作成
        db.create_all()

    return app
