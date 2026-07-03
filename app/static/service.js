import { getLandmarker, startCamera, stopCamera } from "./face-core.js";

// 採点画面で使用するHTML要素。
const video = document.getElementById("training-video");
const button = document.getElementById("start-training");
const placeholder = document.getElementById("training-placeholder");
let running = false;

// 2つのランドマーク間の距離を計算する。
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 点数を0～100の整数へ収める。
const clampScore = (value) => Math.round(Math.max(0, Math.min(100, value)));
// 顔全体のランドマークから中心・大きさ・縦横比を求める。
function getFullFaceStats(face) {
    const points = face.filter((point) => point);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;

    return {
        centerX: xs.reduce((sum, x) => sum + x, 0) / xs.length,
        centerY: ys.reduce((sum, y) => sum + y, 0) / ys.length,
        width,
        height,
        size: width * height,
        aspectRatio: height / width,
    };
}
function calculateScores(face) {
    // 接客では顔全体のランドマークも使う。
    const fullFace = getFullFaceStats(face);

    const leftEye = { x: (face[33].x + face[133].x) / 2, y: (face[159].y + face[145].y) / 2 };
    const rightEye = { x: (face[362].x + face[263].x) / 2, y: (face[386].y + face[374].y) / 2 };
    const eyeDistance = distance(leftEye, rightEye);
    // 鼻先が画面中央からどれだけ離れているか。
    const centerError = Math.hypot(fullFace.centerX - 0.5, fullFace.centerY - 0.5);
    const sizeError = Math.abs(fullFace.size - 0.16);

    // 左右の目の高さの差から、顔の傾きを求める。
    const tilt = Math.abs(leftEye.y - rightEye.y) / eyeDistance;

    // 上まぶたと下まぶたの距離から、目の開き具合を求める。
    const eyeOpen = (
        distance(face[159], face[145]) / distance(face[33], face[133]) +
        distance(face[386], face[374]) / distance(face[362], face[263])
    ) / 2;
    // 口の横幅と縦幅から、表情・口の開きを評価する。
    const mouthWidth = distance(face[61], face[291]) / eyeDistance;
    const mouthOpen = distance(face[13], face[14]) / eyeDistance;
    // 鼻が両目の中央からずれているほど、横を向いている可能性が高い。
    const noseOffset = Math.abs(face[1].x - (leftEye.x + rightEye.x) / 2) / eyeDistance;

    // 各測定値を0～100点へ変換する。
    const scores = {
        gaze: clampScore(100 - noseOffset * 240),
        smile: clampScore(55 + (mouthWidth - 0.75) * 120 - mouthOpen * 60),
        angle: clampScore(100 - tilt * 180 - noseOffset * 50 - Math.abs(fullFace.aspectRatio - 1.25) * 25),
        position: clampScore(100 - centerError * 260 - sizeError * 180),
        eye: clampScore(45 + eyeOpen * 200 + (mouthWidth - 0.75) * 60 - mouthOpen * 40 - centerError * 40),
    };
    // 項目ごとの重みを掛けて合計点を作る。
    scores.total = Math.round(scores.gaze * 0.3 + scores.smile * 0.3 + scores.angle * 0.15 + scores.position * 0.15 + scores.eye * 0.1);

    // totalを除いた項目を点数順に並べ、最も低い項目名を取得する。
    const weakest = Object.entries(scores).filter(([name]) => name !== "total").sort((a, b) => a[1] - b[1])[0][0];

    // 最も低い項目に対応する改善アドバイス。
    const advice = {
        gaze: "お客様を見るように、カメラのレンズに視線を向けましょう。",
        smile: "口角を少し上げて、やわらかい笑顔を意識しましょう。",
        angle: "顔を正面に向け、姿勢をまっすぐにしましょう。",
        position: "顔全体がガイドの中央に入るように位置を調整しましょう。",
        eye: "目を自然に開き、明るく落ち着いた表情を意識しましょう。",
    };
    return { ...scores, advice: advice[weakest] };
}

function renderScores(scores) {
    // calculateScoresで作った点数を画面の各要素へ反映する。
    document.getElementById("total-score").textContent = scores.total;
    document.getElementById("gaze-score").textContent = scores.gaze;
    document.getElementById("smile-score").textContent = scores.smile;
    document.getElementById("angle-score").textContent = scores.angle;
    document.getElementById("position-score").textContent = scores.position;
    document.getElementById("eye-score").textContent = scores.eye;
    document.getElementById("training-advice").textContent = scores.advice;
}

async function analyzeLoop() {
    // MediaPipe Face Landmarkerを一度取得する。
    const landmarker = await getLandmarker();

    // runningがtrueの間、約120ミリ秒ごとに顔を分析する。
    while (running) {
        const result = landmarker.detectForVideo(video, performance.now());
        // 顔を1人検出できた場合だけ採点する。
        if (result.faceLandmarks.length === 1) renderScores(calculateScores(result.faceLandmarks[0]));
        else document.getElementById("training-advice").textContent = "顔全体がガイドの中に入るようにしてください。";
        await new Promise((resolve) => setTimeout(resolve, 120));
    }
}

button.addEventListener("click", async () => {
    // すでに採点中なら、このクリックは停止操作として扱う。
    if (running) {
        running = false;
        stopCamera(video);
        button.textContent = "カメラを開始";
        return;
    }
    button.disabled = true;
    button.textContent = "カメラ準備中...";
    try {
        // カメラ開始後、解析ループを動かす。
        await startCamera(video);
        placeholder.classList.add("hidden");
        running = true;
        button.textContent = "採点を終了";
        analyzeLoop();
    } catch (error) {
        document.getElementById("training-advice").textContent = error.message || "カメラを開始できませんでした。";
        button.textContent = "もう一度試す";
    } finally {
        button.disabled = false;
    }
});
