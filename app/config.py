import os
from pathlib import Path


# プロジェクトのルートフォルダ（wink_app）を取得する。
basedir = Path(__file__).parent.parent


class BaseConfig:
    """すべての環境で共通して使う設定。"""

    # セッションCookieの署名に使う秘密鍵。
    # AWS公開時は環境変数SECRET_KEYへ推測困難な値を設定する。
    SECRET_KEY = os.environ.get(
        "SECRET_KEY",
        "development-secret-change-this-on-aws",
    )

    # SQLAlchemyの変更追跡機能を無効にして、不要な負荷を減らす。
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # リアルタイム採点で使うMediaPipeモデルの保存場所。
    FACE_LANDMARKER_MODEL = basedir / "face_landmarker.task"


class LocalConfig(BaseConfig):
    """PC上で開発するときの設定。"""

    # wink_app.dbをSQLiteデータベースとして使用する。
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{(basedir / 'wink_app.db').as_posix()}"


class TestingConfig(BaseConfig):
    """自動テストで使う設定。"""

    TESTING = True

    # メモリ上だけにDBを作るため、テスト終了後にデータが残らない。
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"


# create_appへ渡された文字列から、使用する設定クラスを選ぶ辞書。
config = {
    "local": LocalConfig,
    "testing": TestingConfig,
}
