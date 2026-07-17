import { captureEmbedding, startCamera, stopCamera } from "./face-core.js";

// 成功・失敗メッセージを指定されたHTML要素へ表示する
function showMessage(element, text, type = "error") {
    element.textContent = text;
    element.className = `message visible ${type}`;
}
// 通信・AI処理中はボタンを無効化し、連打を防止する
function setBusy(button, busy, busyText, normalText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
}

// パスワード認証と顔認証のタブ切り替え
document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach((item) => item.classList.remove("active"));
        document.querySelectorAll(".auth-panel").forEach((panel) => panel.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById(tab.dataset.panel).classList.add("active");
    });
});

const passwordLoginButton = document.getElementById("password-login");

// このIDの要素があるのはログイン画面だけなので、存在するときだけ処理を登録
if (passwordLoginButton) {
    passwordLoginButton.addEventListener("click", async () => {
        // 入力欄からIDとパスワードを取得する。
        const message = document.getElementById("message");
        const password = document.getElementById("password").value;
        if (!password) return showMessage(message, "パスワードを入力してください。");
        setBusy(passwordLoginButton, true, "確認中...", "パスワードでログイン");
        try {
            // Flaskのパスワード認証APIへJSONをPOSTする
            const response = await fetch("/api/reauth-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });
            // Flaskが返したJSONをJavaScriptオブジェクトへ変換する
            const result = await response.json();

            // HTTP 401など成功以外ならcatchへ移動する。
            if (!response.ok) throw new Error(result.message);

            // 認証成功時はFlaskから受け取ったモード選択URLへ移動する
            location.href = result.redirect;
        } catch (error) {
            showMessage(message, error.message || "認証に失敗しました。");
            setBusy(passwordLoginButton, false, "", "パスワードで認証");
        }
    });
}

const faceLoginButton = document.getElementById("start-face-login");
if (faceLoginButton) {
    faceLoginButton.addEventListener("click", async () => {
        const video = document.getElementById("face-video");
        const placeholder = document.getElementById("camera-placeholder");
        const status = document.getElementById("face-status");
        const message = document.getElementById("message");
        setBusy(faceLoginButton, true, "顔認証の準備中...", "カメラを開始して顔認証");
        try {
            // // 入力IDに保存されている登録済み顔特徴量をFlaskから取得する。
            // const registeredResponse = await fetch(`/api/users/${encodeURIComponent(loginId)}/face`);

            // // registeredResult.face_embeddingに登録済み128次元特徴量×7セットが入る。
            // const registeredResult = await registeredResponse.json();
            // if (!registeredResponse.ok) throw new Error(registeredResult.message);

            // ブラウザのカメラを開始する
            await startCamera(video);
            placeholder.classList.add("hidden");
            status.textContent = "正面を向いて、そのまま少し待ってください。";
            // 現在カメラに映っている顔から128次元特徴量を7セット作る
            const currentEmbedding = await captureEmbedding(video, (count, total) => {
                status.textContent = `顔を読み取り中... ${count} / ${total}`;
            });
            
            // comparisonにmatched、similarity、passedSamples、worstDistanceが入る。
            // const comparison = compareEmbeddings(
            //     registeredResult.face_embedding,
            //     currentEmbedding
            // );
            // const percent = Math.round(comparison.similarity * 100);
            // status.textContent =
            //     `類似度 ${percent}%・一致 ${comparison.passedSamples} / 7回`;
   
                        // matchedがtrueの場合だけ、IDと類似度をFlaskへ送信する。
            const completeResponse = await fetch("/api/reauth-face", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        currentEmbedding: currentEmbedding,
                    }),
            });
            const completeResult = await completeResponse.json();
            // Flask側の類似度判定も成功した場合だけ、この下へ進む
            if (!completeResponse.ok) throw new Error(completeResult.message);
            showMessage(message, "顔認証に成功しました。", "success");
            location.href = completeResult.redirect;
        } catch (error) {
            showMessage(message, error.message || "顔認証に失敗しました。");
            status.textContent = "もう一度、正面を向いて試してください。";
            setBusy(faceLoginButton, false, "", "もう一度顔認証する");
        } finally {
            // 成功・失敗にかかわらず、最後に必ずカメラを停止
            stopCamera(video);
        }
    });
}