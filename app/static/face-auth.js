import { captureEmbedding, compareEmbeddings, startCamera, stopCamera } from "./face-core.js";

// 成功・失敗メッセージを指定されたHTML要素へ表示する。
function showMessage(element, text, type = "error") {
    element.textContent = text;
    element.className = `message visible ${type}`;
}
// 通信・AI処理中はボタンを無効化し、連打を防止する。
function setBusy(button, busy, busyText, normalText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
}

// パスワード認証と顔認証のタブ切り替え。
document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".auth-panel").forEach((panel) => panel.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.panel).classList.add("active");
    });
});

const passwordLoginButton = document.getElementById("password-login");

// このIDの要素があるのはログイン画面だけなので、存在するときだけ処理を登録する。
if (passwordLoginButton) {
    passwordLoginButton.addEventListener("click", async () => {
        // 入力欄からIDとパスワードを取得する。
        const message = document.getElementById("message");
        const loginId = document.getElementById("login-id").value.trim();
        const password = document.getElementById("password").value;
        if (!loginId || !password) return showMessage(message, "IDとパスワードを入力してください。");
        setBusy(passwordLoginButton, true, "確認中...", "パスワードでログイン");
        try {
            // Flaskのパスワード認証APIへJSONをPOSTする。
            const response = await fetch("/api/password-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login_id: loginId, password }),
            });
            // Flaskが返したJSONをJavaScriptオブジェクトへ変換する。
            const result = await response.json();

            // HTTP 401など成功以外ならcatchへ移動する。
            if (!response.ok) throw new Error(result.message);

            // 認証成功時はFlaskから受け取ったモード選択URLへ移動する。
            location.href = result.redirect;
        } catch (error) {
            showMessage(message, error.message || "ログインに失敗しました。");
            setBusy(passwordLoginButton, false, "", "パスワードでログイン");
        }
    });
}

const faceLoginButton = document.getElementById("start-face-login");
if (faceLoginButton) {
    faceLoginButton.addEventListener("click", async () => {
        const loginId = document.getElementById("login-id").value.trim();
        const video = document.getElementById("face-video");
        const placeholder = document.getElementById("camera-placeholder");
        const status = document.getElementById("face-status");
        const message = document.getElementById("message");
        if (!loginId) return showMessage(message, "先にログインIDを入力してください。");
        setBusy(faceLoginButton, true, "顔認証の準備中...", "カメラを開始して顔認証");
        try {
            // 入力IDに保存されている登録済み顔特徴量をFlaskから取得する。
            const registeredResponse = await fetch(`/api/users/${encodeURIComponent(loginId)}/face`);

            // registeredResult.face_embeddingに登録済み128次元特徴量×7セットが入る。
            const registeredResult = await registeredResponse.json();
            if (!registeredResponse.ok) throw new Error(registeredResult.message);

            // ブラウザのカメラを開始する。
            await startCamera(video);
            placeholder.classList.add("hidden");
            status.textContent = "正面を向いて、そのまま少し待ってください。";
            // 現在カメラに映っている顔から128次元特徴量を7セット作る。
            const currentEmbedding = await captureEmbedding(video, (count, total) => {
                status.textContent = `顔を読み取り中... ${count} / ${total}`;
            });
            // comparisonにmatched、similarity、passedSamples、worstDistanceが入る。
            const comparison = compareEmbeddings(
                registeredResult.face_embedding,
                currentEmbedding
            );
            const percent = Math.round(comparison.similarity * 100);
            status.textContent =
                `類似度 ${percent}%・一致 ${comparison.passedSamples} / 7回`;
            // matchedがfalseなら、ここで処理を止めてFlaskへ成功通知を送らない。
            if (!comparison.matched) {
                throw new Error(
                    `顔が一致しませんでした（厳格判定：${comparison.passedSamples} / 7回一致）。`
                );
            }
            // matchedがtrueの場合だけ、IDと類似度をFlaskへ送信する。
            const completeResponse = await fetch("/api/face-login-complete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login_id: loginId,
                    similarity: comparison.similarity,
                }),
            });
            const completeResult = await completeResponse.json();
            // Flask側の類似度判定も成功した場合だけ、この下へ進む。
            if (!completeResponse.ok) throw new Error(completeResult.message);
            showMessage(message, "顔認証に成功しました。", "success");
            location.href = completeResult.redirect;
        } catch (error) {
            showMessage(message, error.message || "顔認証に失敗しました。");
            status.textContent = "もう一度、正面を向いて試してください。";
            setBusy(faceLoginButton, false, "", "もう一度顔認証する");
        } finally {
            // 成功・失敗にかかわらず、最後に必ずカメラを停止する。
            stopCamera(video);
        }
    });
}

const registerButton = document.getElementById("register-button");
if (registerButton) {
    registerButton.addEventListener("click", async () => {
        // 登録画面の入力値と表示要素を取得する。
        const password = document.getElementById("register-password").value;
        const passwordConfirm = document.getElementById("register-password-confirm").value;
        const video = document.getElementById("register-video");
        const placeholder = document.getElementById("register-placeholder");
        const status = document.getElementById("register-status");
        const message = document.getElementById("register-message");
        if (!password) return showMessage(message, "パスワードを入力してください。");
        if (password !== passwordConfirm) return showMessage(message, "確認用パスワードが一致しません。");
        setBusy(registerButton, true, "登録準備中...", "カメラを開始して登録");
        try {
            // カメラを開始し、登録用の顔特徴量を7セット作る。
            await startCamera(video);
            placeholder.classList.add("hidden");
            const embedding = await captureEmbedding(video, (count, total) => {
                status.textContent = `顔の数値を作成中... ${count} / ${total}`;
            });
            // パスワードと顔特徴量をFlaskの登録APIへ送る。
            const response = await fetch("/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password, face_embedding: embedding }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message);
            // Flaskが自動発行したU000001形式のIDを画面へ表示する。
            showMessage(
                message,
                `登録完了。あなたのログインIDは ${result.login_id} です。`,
                "success"
            );
            registerButton.textContent = `発行ID：${result.login_id}`;
            status.textContent = "このIDをメモしてください。3秒後にモード選択へ移動します。";
            // IDをメモする時間として3秒待ってからモード選択へ移動する。
            setTimeout(() => {
                location.href = result.redirect;
            }, 3000);
        } catch (error) {
            showMessage(message, error.message || "登録に失敗しました。");
            status.textContent = "入力内容とカメラを確認して、もう一度試してください。";
            setBusy(registerButton, false, "", "もう一度登録する");
        } finally {
            stopCamera(video);
        }
    });
}
