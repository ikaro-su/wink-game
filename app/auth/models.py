from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from app.app import db, login_manager


class User(db.Model, UserMixin):
    """usersテーブルと対応するユーザーモデル。"""

    # 実際のDB上で作成されるテーブル名。
    __tablename__ = "users"

    # 自動採番される内部ID。Flask-Loginもこの値を利用する。
    id = db.Column(db.Integer, primary_key=True)

    # 画面で利用者が入力するU000001形式のログインID。
    login_id = db.Column(db.String(32), unique=True, nullable=False)

    # パスワードそのものではなく、ハッシュ化した文字列を保存する。
    password_hash = db.Column(db.String(255), nullable=False)

    # 本人識別用128次元特徴量を7セット、JSON文字列として保存する。
    face_embedding = db.Column(db.Text, nullable=False)

    # ユーザーを登録した日時。
    created_at = db.Column(
        db.DateTime,
        nullable=False,
        default=datetime.now,
        server_default=db.func.current_timestamp(),
    )

    @property
    def password(self):
        # password_hashを誤ってパスワードとして読み出さないための制限。
        raise AttributeError("パスワードは読み取りできません。")

    @password.setter
    def password(self, password):
        # User(password="...")と代入したとき、自動でハッシュ化する。
        self.password_hash = generate_password_hash(password)

    def verify_password(self, password):
        """入力されたパスワードと保存済みハッシュを照合する。"""
        return check_password_hash(self.password_hash, password)

    @classmethod
    def find_by_login_id(cls, login_id):
        """ログインIDが一致するユーザーを1件取得する。"""
        return cls.query.filter_by(login_id=login_id).first()


@login_manager.user_loader
def load_user(user_id):
    # セッションに保存されたuser_idから、ログイン中のUserを復元する。
    return db.session.get(User, int(user_id))
