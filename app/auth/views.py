import json
import uuid

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, send_file, session, url_for
from flask_login import current_user, login_user, logout_user
from sqlalchemy.exc import IntegrityError

from app.app import db
from app.auth.models import User


# ユーザー登録・ログイン・ログアウトをまとめるBlueprint。
auth = Blueprint(
    "auth",
    __name__,
    template_folder="templates",
)


@auth.get("/")
def index():
    """ログイン画面を表示する。"""

    # すでにログインしている場合、ログイン画面は表示せずモード選択へ進む。
    if current_user.is_authenticated:
        return redirect(url_for("training.modes"))
    return render_template("auth/login.html")


@auth.route("/register", methods=["GET", "POST"])
def register():
    """GETでは登録画面、POSTではユーザーデータの登録を行う。"""

    # 設定ファイルで指定したMediaPipeモデルのパスを取得する。
    model_path = current_app.config["FACE_LANDMARKER_MODEL"]

    # ブラウザから普通にページを開いた場合は登録画面を返す。
    if request.method == "GET":
        return render_template(
            "auth/register.html",
            model_exists=model_path.exists(),
        )

    # JavaScriptが送信したJSONをPythonの辞書へ変換する。
    data = request.get_json(silent=True) or {}
    password = str(data.get("password", ""))

    # 7セット分の128次元顔特徴量が入る。
    face_embedding = data.get("face_embedding")

    # パスワード未入力ならHTTP 400で処理を終了する。
    if not password:
        return jsonify(success=False, message="パスワードを入力してください。"), 400

    # 顔特徴量が「5セット以上」かつ「各セット128個」かを検証する。
    valid_face_templates = (
        isinstance(face_embedding, list)
        and len(face_embedding) >= 5
        and all(
            isinstance(template, list) and len(template) == 128
            for template in face_embedding
        )
    )
    if not valid_face_templates:
        return jsonify(success=False, message="顔の数値を登録できませんでした。"), 400

    try:
        # SQLiteのText列へ保存できるよう、顔特徴量をJSON文字列へ変換する。
        # 小数第6位にそろえてDBサイズを抑える。
        embedding_json = json.dumps(
            [
                [round(float(value), 6) for value in template]
                for template in face_embedding
            ]
        )
    except (TypeError, ValueError):
        return jsonify(success=False, message="顔の数値が正しくありません。"), 400

    try:
        # 最初は重複しない仮IDでUserを作成する。
        # passwordプロパティへ代入するとモデル側でハッシュ化される。
        user = User(
            login_id=f"pending-{uuid.uuid4().hex}",
            password=password,
            face_embedding=embedding_json,
        )
        db.session.add(user)

        # INSERTだけを先に実行し、自動採番されたuser.idを取得する。
        # commitはまだ行わない。
        db.session.flush()

        # 内部IDをU000001形式へ変換し、正式なログインIDにする。
        user.login_id = f"U{user.id:06d}"
        db.session.commit()
    except IntegrityError:
        # 登録途中でDBエラーが起きた場合、変更を取り消す。
        db.session.rollback()
        return jsonify(success=False, message="IDの発行に失敗しました。"), 409

    # 登録直後のユーザーをログイン済みにする。
    login_user(user)

    # どの方法でログインしたかをセッションへ記録する。
    session["auth_method"] = "register"

    # JavaScriptへ発行IDと次の移動先をJSONで返す。
    return jsonify(
        success=True,
        login_id=user.login_id,
        redirect=url_for("training.modes"),
    )


@auth.post("/api/password-login")
def password_login():
    """IDとパスワードを使ってログインするAPI。"""

    data = request.get_json(silent=True) or {}
    login_id = str(data.get("login_id", "")).strip()
    password = str(data.get("password", ""))
    # 入力されたIDに対応するユーザーをDBから検索する。
    user = User.find_by_login_id(login_id)

    # ユーザーが存在しない、またはパスワード不一致なら拒否する。
    if user is None or not user.verify_password(password):
        return jsonify(success=False, message="IDまたはパスワードが違います。"), 401

    # Flask-LoginがセッションへユーザーIDを保存する。
    login_user(user)
    session["auth_method"] = "password"
    return jsonify(success=True, redirect=url_for("training.modes"))


@auth.get("/api/users/<login_id>/face")
def registered_face(login_id):
    """指定IDの登録済み顔特徴量をブラウザへ返す。"""

    user = User.find_by_login_id(login_id.strip())

    if user is None:
        return jsonify(success=False, message="そのIDは登録されていません。"), 404

    # DBではJSON文字列なので、Pythonのリストへ戻す。
    face_embedding = json.loads(user.face_embedding)

    # 古い形式の顔データが混ざっていないか再確認する。
    valid_face_templates = (
        isinstance(face_embedding, list)
        and len(face_embedding) >= 5
        and all(
            isinstance(template, list) and len(template) == 128
            for template in face_embedding
        )
    )
    if not valid_face_templates:
        return jsonify(
            success=False,
            message="顔認証方式が更新されました。このユーザーは再登録が必要です。",
        ), 409

    # 現在の方式では、この登録済み特徴量をブラウザ側で比較する。
    return jsonify(success=True, face_embedding=face_embedding)


@auth.post("/api/face-login-complete")
def face_login_complete():
    """ブラウザ側の顔比較が成功した後、ログイン状態を作るAPI。"""

    data = request.get_json(silent=True) or {}
    login_id = str(data.get("login_id", "")).strip()
    similarity = data.get("similarity")
    user = User.find_by_login_id(login_id)

    if user is None:
        return jsonify(success=False, message="そのIDは登録されていません。"), 404

    try:
        # JSONから届いた類似度を小数へ変換する。
        similarity = float(similarity)
    except (TypeError, ValueError):
        return jsonify(success=False, message="類似度が正しくありません。"), 400

    # 類似度が65%未満ならログインを拒否する。
    # 注意：この値はブラウザから届くため、本番用途ではサーバー側比較が必要。
    if similarity < 0.65:
        return jsonify(success=False, message="顔が一致しませんでした。"), 401

    # ここが顔認証ログインの最終成功地点。
    # Flask-Loginがログイン状態をセッションへ保存する。
    login_user(user)
    session["auth_method"] = "face"
    return jsonify(success=True, redirect=url_for("training.modes"))


@auth.get("/face-model")
def face_model():
    """MediaPipeが使用するface_landmarker.taskをブラウザへ配信する。"""

    model_path = current_app.config["FACE_LANDMARKER_MODEL"]
    if not model_path.exists():
        return jsonify(message="face_landmarker.task がありません。"), 404
    return send_file(model_path, mimetype="application/octet-stream")


@auth.post("/logout")
def logout():
    """Flask-LoginとFlaskセッションの両方を削除してログアウトする。"""

    logout_user()
    session.clear()
    return redirect(url_for("auth.index"))
