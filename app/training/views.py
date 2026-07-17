from flask import Blueprint, redirect, render_template, session, url_for
from flask_login import current_user, login_required


# トレーニング関係のURLをまとめるBlueprint
training = Blueprint(
    "training",
    __name__,
    template_folder="templates",
    url_prefix="/training",
)


# 選択できる練習モードの名前と説明
AVAILABLE_MODES = {
    "interview": {
        "name": "就職面接モード",
        "description": "カメラ目線、表情、顔の傾き、位置をリアルタイム採点します。",
    },
    "photo": {
        "name": "証明写真モード",
        "description": "正面向き、左右の傾き、顔の位置を確認します。",
    },
    "service": {
        "name": "接客・営業モード",
        "description": "明るい表情と視線の安定を確認します。",
    },
}


@training.get("/modes")
@login_required
def modes():
    """ログイン後のモード選択画面を表示する。"""

    return render_template(
        "training/modes.html",
        # current_userはFlask-Loginが復元したログイン中ユーザー
        login_id=current_user.login_id,
        # 顔・パスワードなど、どの方法でログインしたかを表示用に渡す
        auth_method=session.get("auth_method", ""),
    )


# 拡張性の確保と不明なモードからの接続を防ぐ
@training.get("training/<mode>")
@login_required
def training_practice(mode):

    # 選択されたモードをURLから取得
    selected_mode = AVAILABLE_MODES.get(mode)

    # 存在しないモード名の場合は、モード選択画面へ戻す。
    if selected_mode is None:
        return redirect(url_for("training.modes"))

    return render_template(
        "training/training.html",
        mode=mode,
        selected_mode=selected_mode,
    )

@training.get("service/<mode>")
@login_required
def service_practice(mode):

    selected_mode = AVAILABLE_MODES.get(mode)

    # 存在しないモード名の場合は、モード選択画面へ戻す。
    if selected_mode is None:
        return redirect(url_for("training.modes"))

    return render_template(
        "training/service.html",
        mode=mode,
        selected_mode=selected_mode,
    )

@training.get("photo/<mode>")
@login_required
def photo_practice(mode):

    selected_mode = AVAILABLE_MODES.get(mode)

    # 存在しないモード名の場合は、モード選択画面へ戻す。
    if selected_mode is None:
        return redirect(url_for("training.modes"))

    return render_template(
        "training/photos.html",
        mode=mode,
        selected_mode=selected_mode,
    )