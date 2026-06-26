import {
    FaceLandmarker,
    FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304";

// MediaPipeの実行に必要なWebAssemblyファイルの取得先。
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

// 本人識別用のface-apiモデルを取得するCDN。
const FACE_API_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

// MediaPipeランドマークから独自特徴量を作る場合に使用する代表点。
// 現在の本人認証ではface-apiの128次元特徴量を使用している。
const FEATURE_POINTS = [
    10, 21, 54, 58, 67, 93, 103, 109, 127, 132, 136, 148, 149, 152, 172,
    176, 234, 251, 284, 288, 297, 323, 332, 338, 356, 361, 365, 377, 378,
    397, 400, 454, 33, 133, 159, 145, 362, 263, 386, 374, 1, 4, 168, 6,
    61, 291, 13, 14, 78, 308,
];

// AIモデルの読み込み結果を保存する。
// 画面更新ごとに重いモデルを再読み込みしないためPromiseを使い回す。
let landmarkerPromise;
let recognitionModelsPromise;

export async function getLandmarker() {
    // 初回呼び出し時だけMediaPipeモデルを作成する。
    if (!landmarkerPromise) {
        landmarkerPromise = (async () => {
            const vision = await FilesetResolver.forVisionTasks(WASM_URL);
            return FaceLandmarker.createFromOptions(vision, {
                // /face-modelはFlaskがface_landmarker.taskを返すURL。
                baseOptions: { modelAssetPath: "/face-model", delegate: "CPU" },

                // 動画の各フレームを時刻付きで連続解析する設定。
                runningMode: "VIDEO",

                // 複数人が映っても、最初の1人だけを分析する。
                numFaces: 1,
                outputFaceBlendshapes: true,
            });
        })();
    }
    return landmarkerPromise;
}

export async function startCamera(video) {
    // getUserMediaに未対応のブラウザでは処理を中止する。
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("このブラウザではカメラを利用できません。");
    }
    // 利用者へカメラ使用許可を求め、映像ストリームを取得する。
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
    });
    // 取得したカメラ映像を、引数で受け取ったvideo要素へ表示する。
    video.srcObject = stream;
    await video.play();
    return stream;
}

export function createFaceEmbedding(landmarks) {
    // MediaPipeの顔座標を独自の数値列へ変換する補助関数。
    // 現在の顔認証はcaptureEmbedding内のface-apiを利用する。
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const center = landmarks[1];
    const dx = rightEye.x - leftEye.x;
    const dy = rightEye.y - leftEye.y;
    // 両目の距離を基準にして、顔がカメラへ近い・遠い影響を減らす。
    const scale = Math.hypot(dx, dy);
    if (scale < .001) throw new Error("顔の大きさを取得できませんでした。");
    // 両目の傾きを求め、顔が少し傾いても比較しやすいよう回転補正する。
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const embedding = [];
    for (const index of FEATURE_POINTS) {
        const point = landmarks[index];
        const x = (point.x - center.x) / scale;
        const y = (point.y - center.y) / scale;
        embedding.push(x * cos - y * sin, x * sin + y * cos);
    }
    return embedding;
}

export function averageEmbeddings(embeddings) {
    // 複数回取得した同じ長さの特徴量を、要素ごとに平均する。
    const average = new Array(embeddings[0].length).fill(0);
    for (const embedding of embeddings) {
        embedding.forEach((value, index) => { average[index] += value / embeddings.length; });
    }
    return average;
}

function euclideanDistance(a, b) {
    // 配列でない、または要素数が違う場合は比較不能として無限大を返す。
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return Number.POSITIVE_INFINITY;
    }
    // 128次元空間上の2つの顔特徴量の直線距離を求める。
    // 値が小さいほど2つの顔が近い。
    return Math.sqrt(a.reduce((sum, value, index) => {
        const difference = value - b[index];
        return sum + difference * difference;
    }, 0));
}

export function compareEmbeddings(registeredTemplates, currentTemplates) {
    // 登録済み・現在のデータが最低5セットなければ認証失敗にする。
    if (
        !Array.isArray(registeredTemplates) ||
        !Array.isArray(currentTemplates) ||
        registeredTemplates.length < 5 ||
        currentTemplates.length < 5
    ) {
        return { matched: false, similarity: 0, passedSamples: 0 };
    }

    // 現在の顔7セットを1つずつ処理する。
    // 各セットについて、登録済み7セットの中で最も近い距離を採用する。
    const nearestDistances = currentTemplates.map((current) => {
        return Math.min(
            ...registeredTemplates.map((registered) => {
                return euclideanDistance(registered, current);
            })
        );
    });
    // 距離0.36以下だった回数を数える。厳格設定では7回すべて必要。
    const passedSamples = nearestDistances.filter((distance) => distance <= .36).length;

    // 7回分の距離の平均値。小さいほど全体的に似ている。
    const averageDistance = nearestDistances.reduce((sum, value) => sum + value, 0)
        / nearestDistances.length;

    // 7回の中で最も大きい（最も似ていない）距離。
    const worstDistance = Math.max(...nearestDistances);

    // 画面表示とFlaskへの送信用に、距離を0～1の類似度へ変換する。
    const similarity = Math.max(0, Math.min(1, 1 - averageDistance));

    // このオブジェクト全体がface-auth.jsのcomparison変数へ入る。
    return {
        // 以下3条件をすべて満たした場合だけtrueになる。
        matched:
            passedSamples === currentTemplates.length &&
            averageDistance <= .32 &&
            worstDistance <= .36,
        similarity,
        passedSamples,
        worstDistance,
    };
}

export async function captureEmbedding(video, onProgress) {
    // HTML側でface-api.jsを読み込めなかった場合は中止する。
    if (!globalThis.faceapi) {
        throw new Error("顔認証AIを読み込めませんでした。インターネット接続を確認してください。");
    }
    // 初回だけ、顔検出・顔の部位検出・本人識別の3モデルを読み込む。
    if (!recognitionModelsPromise) {
        recognitionModelsPromise = Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
        ]);
    }
    await recognitionModelsPromise;

    // ここへ128次元特徴量を7セット保存する。
    const samples = [];
    const targetSamples = 7;

    // 最大12秒で取得を打ち切るため、開始時刻を記録する。
    const startedAt = performance.now();

    // 軽量なTiny Face Detectorの検出設定。
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: .5,
    });

    // 7セット集まるか、12秒経過するまで顔を繰り返し読み取る。
    while (samples.length < targetSamples && performance.now() - startedAt < 12000) {
        // videoの現在フレームから顔を1人検出し、128次元descriptorを生成する。
        const result = await faceapi
            .detectSingleFace(video, detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (result?.descriptor) {
            // Float32ArrayをJSON送信できる普通の配列へ変換する。
            samples.push(Array.from(result.descriptor));

            // 画面の「3 / 7」などを更新するコールバック。
            onProgress?.(samples.length, targetSamples);
        }
        await new Promise((resolve) => setTimeout(resolve, 180));
    }
    if (samples.length < targetSamples) {
        throw new Error("本人識別用の顔データを取得できません。顔全体を明るく映してください。");
    }
    // 128個の数値×7セットを呼び出し元へ返す。
    return samples;
}

export function stopCamera(video) {
    // カメラの全トラックを停止し、カメラ使用中ランプも消す。
    const stream = video.srcObject;
    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
    }
}
