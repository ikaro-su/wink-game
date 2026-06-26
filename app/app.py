from flask import Flask
from flask_login import LoginManager
from flask_sqlalchemy import SQLAlchemy

from app.config import config


# 拡張機能はここではFlaskアプリと結び付けず、空の状態で作る。
# create_app内のinit_appで結び付けることで、テスト用など複数の設定を使える。
db = SQLAlchemy()
login_manager = LoginManager()

# @login_requiredが付いた画面へ未ログインでアクセスした場合の移動先。
login_manager.login_view = "auth.index"
login_manager.login_message = ""


def create_app(config_key="local"):
    """設定を読み込み、必要な機能を組み立ててFlaskアプリを返す。"""

    # Flaskアプリ本体を作成する。
    app = Flask(__name__)

    # "local"や"testing"に対応する設定クラスを読み込む。
    app.config.from_object(config[config_key])

    # SQLAlchemyとFlask-Loginを、このFlaskアプリへ接続する。
    db.init_app(app)
    login_manager.init_app(app)

    # 循環importを避けるため、Blueprintはcreate_appの中で読み込む。
    from app.auth import views as auth_views
    from app.training import views as training_views

    # 認証機能とトレーニング機能のURLをアプリへ登録する。
    app.register_blueprint(auth_views.auth)
    app.register_blueprint(training_views.training)

    # DB操作にはアプリケーションコンテキストが必要。
    with app.app_context():
        # usersテーブルがなければ、Userモデルの定義から自動作成する。
        db.create_all()

    return app
